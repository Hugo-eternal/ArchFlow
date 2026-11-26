// module: layout, render — step 3.38: applying an organize candidate. Every candidate of the three
// goldens that the dialog may apply writes back block positions, routes (re-routing gives exactly
// the previewed paths) and label spots (label.auto: drawn there while the route is unchanged,
// ignored once it changes); unsafe candidates are refused.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertProject } from '../tools/v2-to-v3';
import { organize, ready, type OrganizeMode } from '../../src/layout/plan';
import { applyCandidate, routeSignature, ApplyError } from '../../src/layout/apply';
import { routeAll } from '../../src/router/full-path';
import { labelPosition } from '../../src/render/wires';
import { validateData } from '../../src/io/schema';
import type { Measure } from '../../src/render/texts';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const diagram = (name: string) => convertProject(JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/layout/__snapshots__/${name}.json`), 'utf8')).project).designs[0].data as BlockDiagram;
const measure: Measure = (t, s) => t.length * s * 0.6;

describe('apply an organize candidate', () => {
  for (const name of ['function', 'power', 'scrambled']) for (const mode of ['routes', 'layout'] as OrganizeMode[]) {
    it(`${name} / ${mode}: every ready candidate applies; others are refused`, () => {
      const d = diagram(name), plan = organize(d, { mode, measure });
      let applied = 0;
      plan.candidates.forEach((c, i) => {
        if (i === 0) return;
        if (!ready(plan, i)) { if (c.metrics.invalid || c.metrics.crossings > plan.base.metrics.crossings) expect(() => applyCandidate(d, plan, i)).toThrow(ApplyError); return; }
        const out = applyCandidate(d, plan, i);
        expect(validateData('function', out)).toEqual([]);
        const routes = routeAll(out);
        for (const w of out.wires) expect(routeSignature(routes.get(w.id)!.ps), `${c.kind} ${w.id}`).toBe(routeSignature(c.paths[w.id]));
        for (const b of out.blocks) expect([b.x, b.y]).toEqual([c.m.nodes.find(n => n.id === b.id)!.x, c.m.nodes.find(n => n.id === b.id)!.y]);
        for (const w of out.wires) if (w.label?.auto) expect(labelPosition(w, routes.get(w.id)!.ps)).toMatchObject({ x: w.label.auto.x, y: w.label.auto.y });
        applied++;
      });
      if (name === 'scrambled' && mode === 'routes') expect(applied).toBeGreaterThan(0);
    });
  }

  it('a label spot is ignored once the route changes; a manual mark wins', () => {
    const d = diagram('scrambled'), plan = organize(d, { mode: 'routes', measure });
    const out = applyCandidate(d, plan, plan.best);
    const w = out.wires.find(x => x.label?.auto)!;
    const ps = routeAll(out).get(w.id)!.ps;
    expect(labelPosition(w, ps)).toMatchObject({ x: w.label!.auto!.x, y: w.label!.auto!.y });
    const moved = ps.map(p => ({ x: p.x, y: p.y + 10 }));
    expect(labelPosition(w, moved)).not.toMatchObject({ x: w.label!.auto!.x, y: w.label!.auto!.y });
    expect(labelPosition({ ...w, label: { ...w.label, mark: { x: 1, y: 2, angle: 0 } } }, ps)).toMatchObject({ x: 1, y: 2 });
  });

  it('the original is never applied', () => {
    const d = diagram('scrambled'), plan = organize(d, { mode: 'routes', measure });
    expect(() => applyCandidate(d, plan, 0)).toThrow(ApplyError);
  });
});
