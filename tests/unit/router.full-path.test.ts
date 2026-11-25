// module: router — V3 src/router/full-path.ts: every wire of the golden function / power
// projects gets the same route as V2.10.1 fullPath(), with the grid on and off.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import { loadGolden } from '../golden/golden.js';
import { convertProject } from '../tools/v2-to-v3';
import { routeAll, routeWire, legalOnGrid } from '../../src/router/full-path';
import { simplify, type Point } from '../../src/core/geometry';
import type { BlockDiagram } from '../../src/io/schema-types';
import * as m from '../../src/model/diagram';

type App = Awaited<ReturnType<typeof openApp>>;
type V2Route = { id: string; ps: Point[]; valid: boolean };

async function v2Routes(app: App, grid: boolean): Promise<{ file: any; routes: V2Route[]; sizes: Record<string, { w: number; h: number }> }> {
  return app.eval(on => {
    if (model.afGrid) model.afGrid.enabled = on;
    render(); drawEdges();
    const routes = model.edges.map(e => { const r = fullPath(e); return { id: e.id, ps: r.ps, valid: r.valid }; });
    const sizes = Object.fromEntries(model.nodes.map(n => [n.id, size(n)]));
    return { file: projectData(), routes, sizes };
  }, grid);
}

const v3Diagram = (file: any): BlockDiagram => {
  const d = convertProject(file).designs.find(x => x.id === file.activeDesignId)!;
  return d.data as BlockDiagram;
};

describe('router/full-path matches V2 on the golden projects', () => {
  let app: App;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const type of ['function', 'power'] as const) {
    for (const grid of [true, false]) {
      it(`${type}, grid ${grid ? 'on' : 'off'}: same polyline and validity for every wire`, async () => {
        await loadGolden(app, type);
        const { file, routes, sizes } = await v2Routes(app, grid);
        const d = v3Diagram(file);
        // with the grid off V2 routes around the blocks' measured (DOM) size; V3 blocks always
        // have their size in the model, so give them the measured one to compare the routing
        if (!grid) for (const b of d.blocks) Object.assign(b, sizes[b.id]);
        expect(d.grid.snap).toBe(grid);
        expect(routes.length).toBeGreaterThan(3);
        const v3 = routeAll(d);
        for (const r of routes) {
          const mine = v3.get(r.id)!;
          expect(mine.ps, r.id).toEqual(simplify(r.ps));
          expect(mine.valid, r.id).toBe(r.valid);
        }
        if (grid) expect(routes.every(r => r.valid)).toBe(true);           // V2 itself has invalid routes with the grid off
      });
    }
  }
});

describe('router/full-path', () => {
  const pair = (grid: boolean) => {
    let d = m.emptyDiagram();
    d.grid.snap = grid;
    const A = m.makeBlock(d, { x: 0, y: 0 }); d = m.addBlock(d, A).data;
    const B = m.makeBlock(d, { x: 400, y: 200 }); d = m.addBlock(d, B).data;
    const { data, id } = m.connect(d, { block: A.id, port: A.ports[1].id }, { block: B.id, port: B.ports[0].id });
    return { d: data, w: m.wireOf(data, id)!, A, B };
  };

  it('grid on: legal route leaving the ports outwards; an illegal manual route is replaced', () => {
    const { d, w } = pair(true);
    const r = routeWire(w, d);
    expect(r.valid).toBe(true);
    expect(r.ps[0]).toEqual({ x: 200, y: 50 });
    expect(r.ps[1].y).toBe(50);
    expect(r.ps[1].x).toBeGreaterThan(200);
    expect(legalOnGrid(r.ps, w, d)).toBe(true);
    const off = routeWire({ ...w, route: [{ x: 213, y: 50 }, { x: 213, y: 250 }] }, d);
    expect(off.valid).toBe(true);
    expect(off.ps).toEqual(r.ps);
    const locked = routeWire({ ...w, locked: true, route: [{ x: 213, y: 50 }] }, d);
    expect(locked).toMatchObject({ valid: false, failed: true });
  });

  it('grid off: waypoints are bridged to the stubs; a whole polyline is used as stored; an illegal one is rerouted unless locked', () => {
    const { d, w } = pair(false);
    // A's OUT is at (200, 50); B's IN at (400, 225)
    const r = routeWire({ ...w, route: [{ x: 300, y: 50 }, { x: 300, y: 225 }] }, d);
    expect(r.ps).toEqual([{ x: 200, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 225 }, { x: 400, y: 225 }]);
    expect(r.valid).toBe(true);
    const whole = [{ x: 200, y: 50 }, { x: 260, y: 50 }, { x: 260, y: 225 }, { x: 400, y: 225 }];
    expect(routeWire({ ...w, route: whole }, d).ps).toEqual(whole);
    const through = routeWire({ ...w, route: [{ x: 200, y: 50 }, { x: 500, y: 50 }, { x: 500, y: 225 }, { x: 400, y: 225 }] }, d);
    expect(through.valid).toBe(true);                                    // cut block B: rerouted
    expect(through.ps).not.toContainEqual({ x: 500, y: 225 });
    const kept = routeWire({ ...w, locked: true, route: [{ x: 200, y: 50 }, { x: 500, y: 50 }, { x: 500, y: 225 }, { x: 400, y: 225 }] }, d);
    expect(kept.valid).toBe(false);                                       // locked: kept, shown as invalid
  });

  it('a later wire pays for overlapping an earlier one', () => {
    let { d, A, B } = pair(true);
    d = m.connect(d, { block: A.id, port: A.ports[1].id }, { block: B.id, port: B.ports[0].id }).data;
    const rs = [...routeAll(d).values()];
    expect(rs.every(r => r.valid)).toBe(true);
    // same two ports: the second wire leaves the same stub but takes a different middle
    expect(rs[0].ps.length).toBeGreaterThan(2);
    expect(rs[1].ps).not.toEqual(rs[0].ps);
  });
});
