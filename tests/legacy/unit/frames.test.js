// module: designs:function — area frames (af40). v2-fix F1: a move the engine refuses must not be
// reported as done, and the overlap is shown while dragging.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

/** Put a frame around the given nodes (all nodes when ids is null) and return the screen centre of its tab. */
async function frameAround(app, ids) {
  await app.eval(ids => {
    const ns = model.nodes.filter(n => !ids || ids.includes(n.id));
    const x0 = Math.min(...ns.map(n => n.x)) - 20, y0 = Math.min(...ns.map(n => n.y)) - 40;
    const x1 = Math.max(...ns.map(n => n.x + n.w)) + 20, y1 = Math.max(...ns.map(n => n.y + n.h)) + 20;
    model.afFrames = [{ id: 'frT', title: 'T', x: x0, y: y0, w: x1 - x0, h: y1 - y0, style: 'dash', color: 'teal' }];
    render(); commit();
  }, ids);
  await app.page.waitForTimeout(200);
  const box = await app.page.locator('#af40-frames .af40-frame[data-id="frT"] .af40-tab').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag out a frame on a 300×200 px patch of empty canvas (drawing mode must be on). */
async function drawFrame(app) {
  const spot = await app.eval(() => {
    const v = document.getElementById('view').getBoundingClientRect();
    const free = (x, y) => { const e = document.elementFromPoint(x, y); return e && document.getElementById('view').contains(e) && !e.closest('.node,.free-text,.zoomtools,.af40-frame,[data-port]'); };
    for (let y = v.top + 40; y < v.bottom - 240; y += 40)
      for (let x = v.left + 40; x < v.right - 340; x += 40)
        if ([[0, 0], [300, 0], [0, 200], [300, 200], [150, 100]].every(([dx, dy]) => free(x + dx, y + dy))) return { x, y };
    return null;
  });
  expect(spot).not.toBeNull();
  await app.page.mouse.move(spot.x, spot.y);
  await app.page.mouse.down();
  await app.page.mouse.move(spot.x + 300, spot.y + 200, { steps: 5 });
  await app.page.mouse.up();
}

const notice = app => app.page.locator('#notice').textContent();

describe('area frame move (F1)', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  it('a refused move keeps the engine reason, shows a warning while dragging and leaves the diagram unchanged', async () => {
    await app.createProject('function');
    const { a, b, z } = await app.eval(() => {
      const [a, b] = [...model.nodes].sort((p, q) => p.x - q.x || p.y - q.y);
      return { a: { id: a.id, x: a.x, y: a.y }, b: { id: b.id, x: b.x, y: b.y }, z: camera.z };
    });
    const tab = await frameAround(app, [a.id]);
    const before = await app.eval(() => JSON.stringify({ nodes: model.nodes, frames: model.afFrames }));
    const steps = await app.eval(() => past.length);

    // drag the frame so block a lands on block b
    const to = { x: tab.x + (b.x - a.x) * z, y: tab.y + (b.y - a.y) * z };
    await app.page.mouse.move(tab.x, tab.y);
    await app.page.mouse.down();
    await app.page.mouse.move((tab.x + to.x) / 2, (tab.y + to.y) / 2, { steps: 4 });
    await app.page.mouse.move(to.x, to.y, { steps: 4 });
    expect(await app.page.locator('#af40-frames .af40-frame[data-id="frT"]').getAttribute('class')).toContain('af40-bad');
    expect(await notice(app)).toContain('重疊');
    await app.page.mouse.up();
    await app.page.waitForTimeout(200);

    const msg = await notice(app);
    expect(msg).toContain('未套用');
    expect(msg).not.toContain('已移動');
    expect(await app.eval(() => JSON.stringify({ nodes: model.nodes, frames: model.afFrames }))).toBe(before);
    expect(await app.eval(() => past.length)).toBe(steps);
    expect(app.errors).toEqual([]);
  });

  it('a move that is applied says so, is one undo step and has no warning', async () => {
    await app.createProject('function');
    const tab = await frameAround(app, null);
    const r0 = await app.eval(() => ({ x: model.nodes[0].x, steps: past.length, z: camera.z }));
    await app.page.mouse.move(tab.x, tab.y);
    await app.page.mouse.down();
    await app.page.mouse.move(tab.x + 100 * r0.z, tab.y, { steps: 6 });
    expect(await app.page.locator('#af40-frames .af40-frame[data-id="frT"]').getAttribute('class')).not.toContain('af40-bad');
    await app.page.mouse.up();
    await app.page.waitForTimeout(200);
    expect(await notice(app)).toContain('已移動區域框');
    const r1 = await app.eval(() => ({ x: model.nodes[0].x, steps: past.length }));
    expect(r1.x).toBeGreaterThan(r0.x);
    expect(r1.steps).toBe(r0.steps + 1);
    expect(app.errors).toEqual([]);
  });
});

describe('area frame drawing hint (F4)', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });
  const HINT = '在畫布上拖曳畫出區域框';

  it('drawing a frame replaces the hint', async () => {
    await app.createProject('function');
    await app.eval(() => window.afFrames.startDraw());
    expect(await notice(app)).toContain(HINT);
    await drawFrame(app);
    await app.page.waitForTimeout(200);
    expect(await app.eval(() => (model.afFrames || []).length)).toBe(1);
    const msg = await notice(app);
    expect(msg).not.toContain(HINT);
    expect(msg).toContain('已新增區域框');
  });

  it('Esc and toggling the command off cancel with a message', async () => {
    await app.createProject('function');
    await app.eval(() => window.afFrames.startDraw());
    await app.page.keyboard.press('Escape');
    expect(await notice(app)).toBe('已取消畫區域框。');
    await app.eval(() => { window.afFrames.startDraw(); window.afFrames.startDraw(); });
    expect(await notice(app)).toBe('已取消畫區域框。');
    expect(await app.eval(() => document.body.classList.contains('af40-drawing'))).toBe(false);
  });
});

describe('new area frame is one undo step (F3)', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const [how, key, title] of [['named with Enter', 'Enter', '電源區'], ['naming cancelled with Esc', 'Escape', null]]) {
    it(`draw + ${how}: one step, and one undo removes the frame`, async () => {
      await app.createProject('function');
      const p0 = await app.eval(() => past.length);
      await app.eval(() => window.afFrames.startDraw());
      await drawFrame(app);
      await app.page.waitForTimeout(150);
      if (title) await app.page.keyboard.type(title);
      await app.page.keyboard.press(key);
      await app.page.waitForTimeout(150);
      const r = await app.eval(() => ({ steps: past.length, frames: (model.afFrames || []).map(f => f.title) }));
      expect(r.steps).toBe(p0 + 1);
      expect(r.frames).toEqual([title || '區域 1']);
      await app.eval(() => undo());
      expect(await app.eval(() => (model.afFrames || []).length)).toBe(0);
      expect(app.errors).toEqual([]);
    });
  }
});

describe('frames do not cut through blocks (F5)', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });
  // ids of blocks the frame border crosses (partly inside), and of blocks fully inside
  const cutAndInside = () => app.eval(() => {
    const f = model.afFrames[0], out = { cut: [], inside: [] };
    for (const n of model.nodes) {
      const s = size(n), hit = n.x < f.x + f.w && n.x + s.w > f.x && n.y < f.y + f.h && n.y + s.h > f.y;
      const inside = n.x >= f.x && n.y >= f.y && n.x + s.w <= f.x + f.w && n.y + s.h <= f.y + f.h;
      if (inside) out.inside.push(n.id); else if (hit) out.cut.push(n.id);
    }
    return out;
  });

  it('with a block selected, the frame command frames it in one step', async () => {
    await app.createProject('function');
    const id = await app.eval(() => { const n = model.nodes[0]; select({ type: 'node', id: n.id }); return n.id; });
    const p0 = await app.eval(() => past.length);
    await app.eval(() => window.afFrames.startDraw());
    await app.page.keyboard.press('Enter');
    await app.page.waitForTimeout(150);
    expect(await app.eval(() => ({ n: (model.afFrames || []).length, drawing: window.afFrames.drawing(), sel: window.afFrames.selected() === model.afFrames[0].id })))
      .toEqual({ n: 1, drawing: false, sel: true });
    const r = await cutAndInside();
    expect(r.inside).toContain(id);
    expect(r.cut).toEqual([]);
    expect(await app.eval(() => past.length)).toBe(p0 + 1);
    expect(app.errors).toEqual([]);
  });

  it('a drawn frame whose border crosses a block grows to include it', async () => {
    await app.createProject('function');
    await app.eval(() => select(null));
    const box = await app.eval(() => { const n = model.nodes[0], r = document.getElementById(n.id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, id: n.id }; });
    await app.eval(() => window.afFrames.startDraw());
    // from above the middle of the block to below-right of it: the left border would cut the block
    await app.page.mouse.move((box.l + box.r) / 2, box.t - 50);
    await app.page.mouse.down();
    await app.page.mouse.move(box.r + 40, box.b + 50, { steps: 5 });
    await app.page.mouse.up();
    await app.page.waitForTimeout(150);
    await app.page.keyboard.press('Enter');
    const r = await cutAndInside();
    expect(r.inside).toContain(box.id);
    expect(r.cut).toEqual([]);
    expect(await notice(app)).toMatch(/擴大到完整包住 \d+ 個被框線切過的方塊/);
    expect(app.errors).toEqual([]);
  });
});
