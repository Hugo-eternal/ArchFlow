// module: layout — step 3.37d: organize plans against V2.10.1 (tests/golden/layout). organize()
// on the V3 diagram, with V2's text widths and V2's current labels as input (V3's canvas places
// some labels differently, 3.37c), gives V2's candidates in V2's order: block positions, paths,
// labels, metrics and change counts; refusals and limits as V2.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertProject } from '../tools/v2-to-v3';
import { organize, ready, LayoutError, type OrganizeMode } from '../../src/layout/plan';
import type { Labels } from '../../src/layout/labels';
import type { Measure } from '../../src/render/texts';
import type { BlockDiagram } from '../../src/io/schema-types';
import * as mdl from '../../src/model/diagram';

const ROOT = path.resolve(__dirname, '../..');
type Pt = { x: number; y: number };
type L = { x: number; y: number; w: number; h: number; text: string; size: number; angle: number };
type Cand = { kind: string; nodes: { id: string; x: number; y: number }[]; paths: Record<string, Pt[]>; labels: Record<string, L>; metrics: Record<string, number>; changes: Record<string, number> };
type Plan = { base: { labels: Record<string, L>; metrics: Record<string, number> }; candidates: Cand[]; errors: string[] };
type Golden = { project: unknown; routes: Plan; layout: Plan };
const golden = (name: string): Golden => JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/layout/__snapshots__/${name}.json`), 'utf8'));
const half = (v: number) => Math.round(v * 2) / 2;

function measureFrom(g: Golden): Measure {
  const widths = new Map<string, number>();
  for (const l of Object.values(g.routes.base.labels)) widths.set(`${l.text}|${l.size}`, l.w - 10);
  return (text, size) => widths.get(`${text}|${size}`) ?? text.length * size * 0.6;
}
const labelsFrom = (ls: Record<string, L>): Labels => Object.fromEntries(Object.entries(ls).map(([k, l]) => [k, { ...l }]));

for (const name of ['function', 'power', 'scrambled']) {
  describe(`organize plans vs V2 — ${name}`, () => {
    const g = golden(name), d = convertProject(g.project as never).designs[0].data as BlockDiagram;
    for (const mode of ['routes', 'layout'] as OrganizeMode[]) {
      it(`${mode} mode`, () => {
        const want = g[mode];
        const plan = organize(d, { mode, measure: measureFrom(g), labels: labelsFrom(want.base.labels) });
        expect(Object.fromEntries(Object.entries(plan.base.metrics).map(([k, v]) => [k, half(v)]))).toEqual(want.base.metrics);
        expect(plan.candidates.slice(1).map(c => c.kind)).toEqual(want.candidates.map(c => c.kind));
        plan.candidates.slice(1).forEach((c, i) => {
          const w = want.candidates[i], tag = `${mode}/${c.kind}`;
          for (const n of w.nodes) { const v = c.m.nodes.find(x => x.id === n.id)!; expect([v.x, v.y], `${tag} ${n.id}`).toEqual([n.x, n.y]); }
          for (const [id, ps] of Object.entries(w.paths)) expect(c.paths[id].map(p => [half(p.x), half(p.y)]), `${tag} path ${id}`).toEqual(ps.map(p => [p.x, p.y]));
          for (const [id, l] of Object.entries(w.labels)) {
            expect(Math.abs(c.labels[id].x - l.x), `${tag} label ${id} x`).toBeLessThanOrEqual(0.5);
            expect(half(c.labels[id].y), `${tag} label ${id} y`).toBe(l.y);
          }
          expect(Object.fromEntries(Object.entries(c.metrics).map(([k, v]) => [k, half(v)])), `${tag} metrics`).toEqual(w.metrics);
          expect(Object.fromEntries(Object.entries(c.changes).map(([k, v]) => [k, v.length])), `${tag} changes`).toEqual(w.changes);
        });
        // V2 reported "no wire can improve" exactly when there is no refined candidate
        expect(plan.errors.some(e => e.kind === 'refined')).toBe(want.errors.some(e => /逐條改善/.test(e)));
      });
    }
  });
}

describe('organize rules', () => {
  const d = convertProject(golden('scrambled').project as never).designs[0].data as BlockDiagram;
  const measure: Measure = (t, s) => t.length * s * 0.6;
  it('the refined plan of the scrambled diagram is ready and chosen; the original never is', () => {
    const plan = organize(d, { mode: 'routes', measure, labels: labelsFrom(golden('scrambled').routes.base.labels) });
    expect(plan.candidates[plan.best].kind).toBe('refined');
    expect(ready(plan, plan.best)).toBe(true);
    expect(ready(plan, 0)).toBe(false);
  });

  it('layout mode with selected wires, too many blocks, locked blocks stay', () => {
    expect(() => organize(d, { mode: 'layout', ids: [d.wires[0].id], measure })).toThrow(LayoutError);
    let big = mdl.emptyDiagram();
    for (let i = 0; i < 61; i++) big = mdl.addBlock(big, mdl.makeBlock(big, { x: i * 300, y: 0 })).data;
    expect(() => organize(big, { mode: 'routes', measure })).toThrow(LayoutError);
    const locked = { ...d, blocks: d.blocks.map((b, i) => (i === 0 ? { ...b, locked: true } : b)) };
    const plan = organize(locked, { mode: 'layout', measure });
    for (const c of plan.candidates) expect([c.m.nodes[0].x, c.m.nodes[0].y]).toEqual([d.blocks[0].x, d.blocks[0].y]);
  });

  it('a diagram with junctions has no layered candidate (V2 refusal); preserved / expanded remain', () => {
    const withJunction = { ...d, junctions: [{ id: 'xjunction01', x: 400, y: 300, name: '' }] };
    const plan = organize(withJunction, { mode: 'layout', measure });
    expect(plan.errors).toContainEqual({ kind: 'layered', error: 'junctions' });
    expect(plan.candidates.map(c => c.kind)).toEqual(expect.arrayContaining(['original', 'preserved', 'expanded']));
  });
});
