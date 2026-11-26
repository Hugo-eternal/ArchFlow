// module: layout — step 3.37a: the organize engine's input and measuring against V2.10.1
// (tests/golden/layout): the V3 diagram's engine model gives V2's geometry (blocks, end anchors)
// and current paths; the metrics (validity, crossings, overlap, bends, length, shared / unrelated /
// re-joined runs, label conflicts) of V2's original and of every V2 candidate come out the same.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertProject } from '../tools/v2-to-v3';
import { routeAll } from '../../src/router/full-path';
import { currentPaths, fromDiagram, geometry, type EngineModel, type Geometry } from '../../src/layout/model';
import { allowed, measure, score, type EngineLabel, type Metrics } from '../../src/layout/metrics';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
type Plan = { geo: { grid: number; boxes: { id: string; x: number; y: number; w: number; h: number }[]; anchors: Record<string, { x: number; y: number }> }; paths: Record<string, { x: number; y: number }[]>; labels: Record<string, EngineLabel>; metrics: Metrics };
type Cand = Plan & { kind: string; nodes: { id: string; x: number; y: number; ports: { id: string; side: string; t: number }[] }[]; error?: string };
type Golden = { project: unknown; routes: { base: Plan; candidates: Cand[] }; layout: { base: Plan; candidates: Cand[] } };
const golden = (name: string): Golden => JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/layout/__snapshots__/${name}.json`), 'utf8'));
const diagram = (g: Golden) => (convertProject(g.project as never).designs[0].data as BlockDiagram);
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

/** The engine model of a V2 candidate: its block positions (organize never moves ports: permissions.ports is off;
 *  the golden's port t is rounded, so it is not used). */
function candidateModel(m: EngineModel, c: Cand): EngineModel {
  return { ...m, nodes: m.nodes.map(n => { const x = c.nodes.find(k => k.id === n.id)!; return { ...n, x: x.x, y: x.y }; }) };
}
const geoOf = (m: EngineModel, g: Plan['geo']): Geometry => ({ grid: g.grid, anchors: g.anchors, boxes: g.boxes.map(b => ({ ...b, ports: m.nodes.find(n => n.id === b.id)!.ports })) });
const pick = (x: Metrics) => ({ invalid: x.invalid, crossings: x.crossings, overlap: x.overlap, bends: x.bends, length: x.length, shared: x.shared, unrelated: x.unrelated, rejoined: x.rejoined, labelConflicts: x.labelConflicts, unwanted: x.unwanted });
const half = (x: Metrics) => Object.fromEntries(Object.entries(pick(x)).map(([k, v]) => [k, Math.round(v * 2) / 2]));

for (const name of ['function', 'power', 'scrambled']) {
  describe(`layout input and metrics vs V2 — ${name}`, () => {
    const g = golden(name), d = diagram(g), m = fromDiagram(d), base = g.routes.base;

    it('geometry: blocks and end anchors', () => {
      const geo = geometry(m);
      expect(geo.grid).toBe(base.geo.grid);
      for (const b of base.geo.boxes) {
        const v = geo.boxes.find(x => x.id === b.id)!;
        expect([v.x, v.y, v.w, v.h].every((x, i) => near(x, [b.x, b.y, b.w, b.h][i])), `${b.id} ${JSON.stringify([v.x, v.y, v.w, v.h])}`).toBe(true);
      }
      for (const [k, a] of Object.entries(base.geo.anchors)) expect(near(geo.anchors[k].x, a.x) && near(geo.anchors[k].y, a.y), k).toBe(true);
    });

    it('current paths are V2\'s', () => {
      const ps = currentPaths(m, routeAll(d));
      for (const [id, want] of Object.entries(base.paths)) expect(ps[id].map(p => [p.x, p.y]), id).toEqual(want.map(p => [p.x, p.y]));
    });

    it('metrics of the original and of every candidate (routes and layout mode)', () => {
      const plans: [string, EngineModel, Plan][] = [['base', m, base]];
      for (const mode of ['routes', 'layout'] as const) for (const c of g[mode].candidates) if (!c.error) plans.push([`${mode}/${c.kind}`, candidateModel(m, c), c]);
      for (const [label, mm, p] of plans) {
        const got = measure({ m: mm, geo: geoOf(mm, p.geo), paths: p.paths, labels: p.labels });
        expect(half(got), label).toEqual(half(p.metrics));
      }
    });

    if (name === 'scrambled') it('score and acceptance: the refined candidate V2 offers is allowed and better than the original', () => {
      const c = g.routes.candidates.find(x => x.kind === 'refined')!;
      const mm = candidateModel(m, c);
      expect(allowed({ metrics: c.metrics, geo: geoOf(mm, c.geo) }, { metrics: base.metrics })).toBe(true);
      expect(score(c.metrics)).toBeLessThan(score(base.metrics));
      // the preserved candidate adds a crossing: not allowed
      const pres = g.routes.candidates.find(x => x.kind === 'preserved')!;
      expect(allowed({ metrics: pres.metrics, geo: geoOf(candidateModel(m, pres), pres.geo) }, { metrics: base.metrics })).toBe(false);
    });
  });
}
