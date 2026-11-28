// module: core — batch(fn, mode): several changes become one undo step (v2-fix O5).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('batch()', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  // two separate committed changes (text boxes: no overlap rule can reject them)
  const addTwo = () => {
    for (const k of [1, 2]) { model.texts.push({ id: 'bt' + k + Date.now().toString(36), text: 't' + k, x: 2000 + 300 * k, y: 2000, w: 200, size: 16, color: '#243e5d', bold: false, italic: false }); render(); commit(); }
  };

  it("'auto': inner commits become one undo step", async () => {
    await app.createProject('function');
    const r = await app.eval(src => {
      const add = (0, eval)('(' + src + ')');
      const n0 = model.texts.length, p0 = past.length;
      batch(add);
      const n1 = model.texts.length, steps = past.length - p0;
      undo();
      return { n0, n1, steps, afterUndo: model.texts.length, swapped: commit.toString().includes('called=true') };
    }, addTwo.toString());
    expect(r.n1).toBe(r.n0 + 2);
    expect(r.steps).toBe(1);
    expect(r.afterUndo).toBe(r.n0);
    expect(r.swapped).toBe(false);
  });

  it("'auto' without inner commit records nothing; 'always' records one step", async () => {
    await app.createProject('function');
    const r = await app.eval(() => {
      const p0 = past.length;
      batch(() => {});
      const auto = past.length - p0;
      batch(() => { model.nodes[0].x += 40; }, 'always');
      return { auto, always: past.length - p0 };
    });
    expect(r).toEqual({ auto: 0, always: 1 });
  });

  it("'none' leaves the commit to the caller", async () => {
    await app.createProject('function');
    const r = await app.eval(src => {
      const add = (0, eval)('(' + src + ')');
      const p0 = past.length;
      batch(add, 'none');
      const inside = past.length - p0;
      commit();
      return { inside, after: past.length - p0 };
    }, addTwo.toString());
    expect(r).toEqual({ inside: 0, after: 1 });
  });

  it('a throwing fn restores the model, keeps history and re-throws', async () => {
    await app.createProject('function');
    const r = await app.eval(() => {
      const before = JSON.stringify(model), p0 = past.length;
      let message = null;
      try { batch(() => { model.nodes[0].x += 999; commit(); throw Error('boom'); }); } catch (e) { message = e.message; }
      return { message, same: JSON.stringify(model) === before, steps: past.length - p0, restored: !commit.toString().includes('called=true') };
    });
    expect(r).toEqual({ message: 'boom', same: true, steps: 0, restored: true });
  });

  it('nested batches join the outer step', async () => {
    await app.createProject('function');
    const r = await app.eval(() => {
      const p0 = past.length;
      batch(() => { model.nodes[0].x += 40; commit(); batch(() => { model.nodes[0].y += 40; commit(); }); });
      return past.length - p0;
    });
    expect(r).toBe(1);
  });
});
