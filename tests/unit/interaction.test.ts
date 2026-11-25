// module: core — V3 src/interaction/* (commit step, hit testing, pointer gestures, canvas
// commands), driven with synthetic pointer sequences on a real Store; drag snapping checked
// against V2.10.1's snap.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import { Store } from '../../src/core/store';
import { CommandRegistry } from '../../src/core/commands';
import * as m from '../../src/model/diagram';
import { routeAll } from '../../src/router/full-path';
import { prepare, commitEdit } from '../../src/interaction/commit';
import { hitTest, itemsInRect, nearestPort, segmentDistance } from '../../src/interaction/hit';
import { Gestures, type GestureHost } from '../../src/interaction/gestures';
import { canvasCommands, type CanvasContext } from '../../src/interaction/commands';
import { snapIfOn, normalize } from '../../src/core/grid';
import type { BlockDiagram, Camera } from '../../src/io/schema-types';

function setup(grid = true) {
  let d = m.emptyDiagram();
  d.grid.snap = grid;
  const A = { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A' }; d = m.addBlock(d, A).data;
  const B = { ...m.makeBlock(d, { x: 400, y: 200 }), id: 'B' }; d = m.addBlock(d, B).data;
  d = m.addText(d, { x: 0, y: 300 }, 'note').data;
  // a new block is put on the grid by its first commit (V2 too); start from that state
  if (grid) d = normalize(d, d.grid.size);
  const store = new Store();
  store.newProject('P', { type: 'function', name: 'D', data: d });
  let camera: Camera = { x: 0, y: 0, z: 1 };
  const changes: number[] = [], refusals: string[] = [];
  const host: GestureHost = {
    store, camera: () => camera, setCamera: c => { camera = c; },
    routes: () => routeAll(store.data(store.activeDesignId) as BlockDiagram),
    flavour: () => 'function', changed: () => changes.push(1), refused: r => refusals.push(r.error.message),
  };
  const g = new Gestures(host);
  const data = () => store.data(store.activeDesignId) as BlockDiagram;
  return { store, g, data, A, B, cam: () => camera, setCam: (c: Camera) => { camera = c; }, refusals, changes };
}

describe('interaction/commit', () => {
  it('normalises to the grid, cleans junctions and commits one undo step', () => {
    const { store, data } = setup();
    const r = commitEdit(store, d => m.moveItems(d, ['A'], 13, 7));
    expect(r.ok).toBe(true);
    expect([m.blockOf(data(), 'A')!.x, m.blockOf(data(), 'A')!.y]).toEqual([10, 10]);
    expect(store.activeDesign!.history.undoDepth).toBe(1);
    store.undo();
    expect(m.blockOf(data(), 'A')!.x).toBe(0);
  });

  it('a locked block refuses the edit and nothing is committed', () => {
    const { store, data } = setup();
    commitEdit(store, d => m.updateBlock(d, 'A', { locked: true }));
    const depth = store.activeDesign!.history.undoDepth;
    const r = commitEdit(store, d => m.moveItems(d, ['A'], 20, 0));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/locked-block/);
    expect(m.blockOf(data(), 'A')!.x).toBe(0);
    expect(store.activeDesign!.history.undoDepth).toBe(depth);
  });

  it('no-op edits add no history; model errors come back as results', () => {
    const { store } = setup();
    expect(commitEdit(store, d => d)).toMatchObject({ ok: true, changed: false });
    expect(store.activeDesign!.history.undoDepth).toBe(0);
    const r = commitEdit(store, d => m.connect(d, { block: 'A', port: 'x' }, { block: 'B', port: 'y' }).data);
    expect(r.ok).toBe(false);
    const d = m.emptyDiagram();
    expect(prepare(d, d)).toMatchObject({ ok: true, changed: false });
  });
});

describe('interaction/hit', () => {
  it('ports above blocks, wires by distance, boxes contain whole items', () => {
    const { data, store } = setup(false);
    commitEdit(store, d => m.connect(d, { block: 'A', port: data().blocks[0].ports[1].id }, { block: 'B', port: data().blocks[1].ports[0].id }).data);
    const d = data(), routes = routeAll(d);
    expect(hitTest(d, { x: 200, y: 50 })).toMatchObject({ kind: 'port', block: 'A' });
    expect(hitTest(d, { x: 100, y: 50 })).toEqual({ kind: 'block', id: 'A' });
    expect(hitTest(d, { x: 5, y: 305 })).toMatchObject({ kind: 'text' });
    const mid = routes.get(d.wires[0].id)!.ps;
    const p = { x: (mid[1].x + mid[2].x) / 2 + 1, y: (mid[1].y + mid[2].y) / 2 + 2 };
    expect(hitTest(d, p, { routes })).toEqual({ kind: 'wire', id: d.wires[0].id });
    expect(hitTest(d, { x: 900, y: 900 }, { routes })).toBeNull();
    expect(itemsInRect(d, { x: -10, y: -10, w: 700, h: 400 }).map(i => i.kind).sort()).toEqual(['block', 'block', 'text', 'wire']);
    expect(itemsInRect(d, { x: -10, y: -10, w: 700, h: 320 }).map(i => i.kind).sort()).toEqual(['block', 'block', 'wire']);
    expect(nearestPort(d, { x: 215, y: 50 }, 22)).toMatchObject({ block: 'A' });
    expect(segmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
});

describe('interaction/gestures', () => {
  it('drag a block: draft while moving, one snapped commit on release, Escape cancels', () => {
    const { g, data, store } = setup();
    g.down({ x: 100, y: 50 });
    g.move({ x: 101, y: 50 });                                         // below the click slop
    expect(g.busy).toBe(true);
    g.move({ x: 137, y: 73 });
    expect(m.blockOf(g.draft(), 'A')!.x).toBe(40);                     // snapped while dragging
    expect(m.blockOf(data(), 'A')!.x).toBe(0);                         // model untouched
    g.up({ x: 137, y: 73 });
    expect([m.blockOf(data(), 'A')!.x, m.blockOf(data(), 'A')!.y]).toEqual([40, 20]);
    expect(store.activeDesign!.history.undoDepth).toBe(1);
    g.down({ x: 140, y: 70 }); g.move({ x: 300, y: 70 }); g.cancel();
    expect(m.blockOf(data(), 'A')!.x).toBe(40);
    expect(store.activeDesign!.history.undoDepth).toBe(1);
  });

  it('drag from a port to another port creates one wire and selects it', () => {
    const { g, data, A, B } = setup();
    g.down({ x: 200, y: 50 });                                         // A.OUT
    g.move({ x: 300, y: 120 });
    expect(g.preview).toMatchObject({ kind: 'wire', target: null });
    expect(g.previewPoints()).toEqual([{ x: 200, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 120 }]);
    g.move({ x: 395, y: 228 });                                        // near B.IN (400, 225)
    expect(g.preview).toMatchObject({ kind: 'wire', target: { x: 400, y: 230 } });
    const pts = g.previewPoints();
    expect(pts[0]).toEqual({ x: 200, y: 50 });
    expect(pts.at(-1)).toEqual({ x: 400, y: 230 });
    expect(pts.slice(1).every((p, i) => p.x === pts[i].x || p.y === pts[i].y)).toBe(true);
    g.up({ x: 395, y: 228 });
    expect(data().wires).toHaveLength(1);
    expect(data().wires[0]).toMatchObject({ a: { block: 'A', port: A.ports[1].id }, b: { block: 'B', port: B.ports[0].id } });
    expect(g.selection).toEqual([{ kind: 'wire', id: data().wires[0].id }]);
    g.down({ x: 200, y: 50 }); g.move({ x: 600, y: 600 }); g.up({ x: 600, y: 600 });   // dropped on nothing
    expect(data().wires).toHaveLength(1);
  });

  it('click selects, Shift-click toggles, empty click clears, Shift-drag box-selects', () => {
    const { g } = setup();
    g.down({ x: 100, y: 50 }); g.up({ x: 100, y: 50 });
    expect(g.selection).toEqual([{ kind: 'block', id: 'A' }]);
    g.down({ x: 500, y: 260, shift: true }); g.up({ x: 500, y: 260 });
    expect(g.selection.map(s => s.id)).toEqual(['A', 'B']);
    g.down({ x: 100, y: 50, shift: true }); g.up({ x: 100, y: 50 });
    expect(g.selection.map(s => s.id)).toEqual(['B']);
    g.down({ x: 900, y: 900 }); g.up({ x: 900, y: 900 });
    expect(g.selection).toEqual([]);
    g.down({ x: -20, y: -20, shift: true }); g.move({ x: 650, y: 350 });
    expect(g.preview?.kind).toBe('box');
    g.up({ x: 650, y: 350 });
    expect(g.selection.map(s => s.kind).sort()).toEqual(['block', 'block', 'text']);
  });

  it('moving a multi-selection moves all of it in one step; pan and wheel change the camera only', () => {
    const { g, data, store, cam } = setup();
    g.select([{ kind: 'block', id: 'A' }, { kind: 'block', id: 'B' }]);
    g.down({ x: 100, y: 50 }); g.move({ x: 160, y: 50 }); g.up({ x: 160, y: 50 });
    expect([m.blockOf(data(), 'A')!.x, m.blockOf(data(), 'B')!.x]).toEqual([60, 460]);
    expect(store.activeDesign!.history.undoDepth).toBe(1);
    g.down({ x: 900, y: 900 }); g.move({ x: 950, y: 920 }); g.up({ x: 950, y: 920 });
    expect(cam()).toEqual({ x: 50, y: 20, z: 1 });
    g.wheel(-200, { x: 0, y: 0 });
    expect(cam().z).toBeGreaterThan(1);
    expect(store.activeDesign!.history.undoDepth).toBe(1);
  });
});

describe('interaction/commands', () => {
  it('Delete, undo / redo, arrows (grid steps, Shift = 10), Escape and select all through the registry', async () => {
    const { g, store, data } = setup();
    const reg = new CommandRegistry<CanvasContext>();
    reg.registerAll(canvasCommands());
    const ctx: CanvasContext = { store, gestures: g };
    g.select([{ kind: 'block', id: 'A' }]);
    expect(reg.handleKey({ key: 'ArrowRight' }, ctx)).toBe(true);
    expect(m.blockOf(data(), 'A')!.x).toBe(10);
    reg.handleKey({ key: 'ArrowDown', shiftKey: true }, ctx);
    expect(m.blockOf(data(), 'A')!.y).toBe(100);
    reg.handleKey({ key: 'Delete' }, ctx);
    expect(m.blockOf(data(), 'A')).toBeUndefined();
    expect(reg.handleKey({ key: 'Delete' }, ctx)).toBe(false);          // nothing selected
    reg.handleKey({ key: 'z', ctrlKey: true }, ctx);
    expect(m.blockOf(data(), 'A')!.y).toBe(100);
    reg.handleKey({ key: 'y', ctrlKey: true }, ctx);
    expect(m.blockOf(data(), 'A')).toBeUndefined();
    reg.handleKey({ key: 'a', ctrlKey: true }, ctx);
    expect(g.selection.length).toBe(2);
    reg.handleKey({ key: 'Escape' }, ctx);
    expect(g.selection).toEqual([]);
    expect(reg.handleKey({ key: 'Delete', target: { tagName: 'INPUT', type: 'text' } }, ctx)).toBe(false);
  });
});

describe('drag snapping matches V2', () => {
  let app: Awaited<ReturnType<typeof openApp>>;
  beforeAll(async () => { app = await openApp(); await app.createProject('function'); });
  afterAll(async () => { await app?.close(); });

  it('new position = snap(start + pointer delta), as V2 pointermove (L318) with ArchFlowGridSnap', async () => {
    const deltas = Array.from({ length: 50 }, (_, i) => [((i * 37) % 97) - 48 + 0.3 * i, ((i * 53) % 89) - 44 - 0.7 * i]);
    const v2 = await app.eval(ds => { const n = model.nodes[0]; return ds.map(([dx, dy]) => [snap(n.x + dx), snap(n.y + dy)]); }, deltas);
    const start = await app.eval(() => ({ x: model.nodes[0].x, y: model.nodes[0].y, grid: model.afGrid }));
    const grid = { size: start.grid.size, show: true, snap: start.grid.enabled };
    expect(deltas.map(([dx, dy]) => [snapIfOn(start.x + dx, grid), snapIfOn(start.y + dy, grid)])).toEqual(v2);
  });
});
