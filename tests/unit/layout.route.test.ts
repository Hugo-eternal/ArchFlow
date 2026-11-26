// module: layout — step 3.37b: re-routing for organize plans against V2.10.1 (tests/golden/layout).
// For every V2 candidate (routes mode: preserved; layout mode: preserved / expanded / layered),
// the V3 engine model with the candidate's block positions and V2's original paths gives exactly
// V2's re-routed paths (no time budget: deterministic).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertProject } from '../tools/v2-to-v3';
import { routeAll } from '../../src/router/full-path';
import { currentPaths, fromDiagram, geometry, type EngineModel } from '../../src/layout/model';
import { adapters, routes, type Permissions } from '../../src/layout/route';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
type Pt = { x: number; y: number };
type Cand = { kind: string; nodes: { id: string; x: number; y: number; ports: { id: string; side: string; t: number }[] }[]; paths: Record<string, Pt[]>; geo: { anchors: Record<string, Pt> }; error?: string };
type Golden = { project: unknown; routes: { candidates: Cand[] }; layout: { candidates: Cand[] } };
const golden = (name: string): Golden => JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/layout/__snapshots__/${name}.json`), 'utf8'));
const PERMS: Permissions = { routes: true, blocks: false, ports: false, sides: false, labels: true, scope: 'all', space: 'wide', ids: [] };
const half = (ps: Pt[]) => ps.map(p => [Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2]);

/** The engine model with a candidate's block positions (organize never moves ports: permissions.ports is off). */
function moved(m: EngineModel, c: Cand): EngineModel {
  return { ...m, nodes: m.nodes.map(n => { const x = c.nodes.find(k => k.id === n.id)!; return { ...n, x: x.x, y: x.y }; }) };
}

for (const name of ['function', 'power', 'scrambled']) {
  describe(`organize routing vs V2 — ${name}`, () => {
    const g = golden(name), d = convertProject(g.project as never).designs[0].data as BlockDiagram;
    const m = fromDiagram(d), before = currentPaths(m, routeAll(d));
    for (const mode of ['routes', 'layout'] as const) for (const c of g[mode].candidates) {
      if (c.error || c.kind === 'refined') continue;
      it(`${mode} / ${c.kind}`, () => {
        const mm = moved(m, c), geo = geometry(mm);
        for (const [k, a] of Object.entries(c.geo.anchors)) expect([geo.anchors[k].x, geo.anchors[k].y], `anchor ${k}`).toEqual([a.x, a.y]);
        const got = routes(mm, geo, before, { ...PERMS, blocks: mode === 'layout' });
        for (const [id, want] of Object.entries(c.paths)) expect(half(got[id]), id).toEqual(half(want));
      });
    }
  });
}

describe('adapters', () => {
  it('lead out of a port on the grid, at most five; a junction on the grid is its own adapter', () => {
    const g = golden('scrambled'), d = convertProject(g.project as never).designs[0].data as BlockDiagram;
    const m = fromDiagram(d), geo = geometry(m), e = m.edges[0];
    const list = adapters(e.a, geo, m);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(5);
    expect(adapters({ junction: 'j' }, { ...geo, anchors: { ...geo.anchors, [JSON.stringify({ junction: 'j' })]: { x: 100, y: 200 } } }, { ...m, junctions: [{ id: 'j', x: 100, y: 200, name: '' }] })).toEqual([[{ x: 100, y: 200 }]]);
  });
});
