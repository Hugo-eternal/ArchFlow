// module: core — automatic arrangement. In V2.10.1, autoArrange() opens the RC4 organize
// preview (#v4Dialog) for block designs (audit §4.3) and lays out the timeline for schedules.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';

const SCRAMBLED = [[700, 400], [60, 420], [720, 40], [80, 60]];

// geometry snapshot taken inside the app: block boxes and routed wire points
const snapshot = app => app.eval(() => {
  drawEdges();
  return {
    blocks: model.nodes.map(n => { const s = size(n); return { id: n.id, l: n.x, t: n.y, r: n.x + s.w, b: n.y + s.h }; }),
    wires: model.edges.map(e => ({ id: e.id, ends: [e.a.node, e.b.node], ps: (routes.get(e.id)?.ps || []).map(p => ({ x: p.x, y: p.y })) })),
  };
});
const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const cuts = (a, b, r) => (a.y === b.y
  ? a.y > r.t + 0.01 && a.y < r.b - 0.01 && Math.max(a.x, b.x) > r.l + 0.01 && Math.min(a.x, b.x) < r.r - 0.01
  : a.x > r.l + 0.01 && a.x < r.r - 0.01 && Math.max(a.y, b.y) > r.t + 0.01 && Math.min(a.y, b.y) < r.b - 0.01);
function assertValidDiagram(g) {
  for (let i = 0; i < g.blocks.length; i++) for (let j = i + 1; j < g.blocks.length; j++)
    expect(overlaps(g.blocks[i], g.blocks[j]), `${g.blocks[i].id} overlaps ${g.blocks[j].id}`).toBe(false);
  for (const w of g.wires) {
    expect(w.ps.length, w.id).toBeGreaterThan(1);
    expect(w.ps.slice(1).every((p, i) => p.x === w.ps[i].x || p.y === w.ps[i].y), `${w.id} orthogonal`).toBe(true);
    const others = g.blocks.filter(b => !w.ends.includes(b.id));
    expect(w.ps.slice(1).every((p, i) => others.every(r => !cuts(w.ps[i], p, r))), `${w.id} avoids blocks`).toBe(true);
  }
}

async function scrambledProject(app) {
  await app.createProject('function');
  await app.eval(pos => { model.nodes.forEach((n, i) => { n.x = pos[i][0]; n.y = pos[i][1]; }); for (const e of model.edges) e.manual = null; render(); commit(); }, SCRAMBLED);
}
const waitDone = app => app.page.waitForFunction(() => /完成/.test(document.getElementById('v4Status').textContent), null, { timeout: 30000 });
const closeDialog = app => app.eval(() => { const d = document.getElementById('v4Dialog'); if (d.open) d.close(); });

describe('organize preview (RC4) on block designs', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  it('offers nothing to apply when the diagram is already tidy', async () => {
    await app.createProject('function');
    await app.eval(() => autoArrange());
    await waitDone(app);
    expect(await app.eval(() => document.getElementById('v4Apply').disabled)).toBe(true);
    await closeDialog(app);
  });

  it('routes mode keeps blocks in place, produces valid wires, and can be undone', async () => {
    await scrambledProject(app);
    const before = await snapshot(app);
    const historyBefore = await app.eval(() => past.length);
    await app.eval(() => autoArrange());
    await waitDone(app);
    expect(await app.eval(() => document.getElementById('v4Apply').disabled)).toBe(false);
    await app.page.click('#v4Apply');
    await app.page.waitForTimeout(500);
    const after = await snapshot(app);
    expect(after.blocks).toEqual(before.blocks);
    assertValidDiagram(after);
    expect(await app.eval(() => past.length)).toBe(historyBefore + 1);
    await app.eval(() => undo());
    expect((await snapshot(app)).wires).toEqual(before.wires);
  });

  async function layeredLayout() {
    await scrambledProject(app);
    await app.eval(() => autoArrange());
    await waitDone(app);
    await app.page.selectOption('#v4Mode', 'layout');
    await app.page.waitForTimeout(300);
    await waitDone(app);
    await app.page.getByRole('button', { name: /依連接關係分層/ }).click();
    await app.page.waitForTimeout(200);
    expect(await app.eval(() => document.getElementById('v4Apply').disabled)).toBe(false);
    await app.page.click('#v4Apply');
    await app.page.waitForTimeout(500);
    return snapshot(app);
  }

  it('layout mode ("依連接關係分層") moves blocks into a valid, non-overlapping layout', async () => {
    const g = await layeredLayout();
    expect(g.blocks.map(b => [b.l, b.t])).not.toEqual(SCRAMBLED);
    assertValidDiagram(g);
  });

  it('layout mode is deterministic', async () => {
    const a = await layeredLayout();
    const b = await layeredLayout();
    expect(b.blocks.map(x => [x.l, x.t])).toEqual(a.blocks.map(x => [x.l, x.t]));
  });
});

describe('schedule auto layout', () => {
  let app;
  beforeAll(async () => { app = await openApp(); await app.createProject('schedule'); });
  afterAll(async () => { await app?.close(); });

  it('re-laying out resets manual offsets, is deterministic and keeps task cards apart', async () => {
    const run = () => app.eval(() => {
      for (const n of model.nodes) { n.cardDx = 37; n.cardDy = -21; }
      render(); autoArrange();
      return model.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, dx: n.cardDx || 0, dy: n.cardDy || 0 }));
    });
    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
    expect(a.every(n => n.dx === 0 && n.dy === 0)).toBe(true);
    const box = n => ({ l: n.x, t: n.y, r: n.x + n.w, b: n.y + n.h });
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++)
      expect(overlaps(box(a[i]), box(a[j])), `${a[i].id} / ${a[j].id}`).toBe(false);
  });
});
