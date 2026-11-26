// module: layout — step 3.37c: wire labels for organize plans against V2.10.1 (tests/golden/layout).
// Widths: V2 measured text on a canvas; the test measures with the widths V2 recorded, so that
// positions can be compared exactly. The current labels are where V2 drew them; for every V2
// candidate, arranging its labels on its paths gives V2's positions.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertProject } from '../tools/v2-to-v3';
import { routeAll } from '../../src/router/full-path';
import { currentPaths, fromDiagram, geometry, type EngineModel } from '../../src/layout/model';
import { arrangeLabels, defaultLabels, liveLabels } from '../../src/layout/labels';
import type { Permissions } from '../../src/layout/route';
import type { Measure } from '../../src/render/texts';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
type Pt = { x: number; y: number };
type L = { x: number; y: number; w: number; h: number; text: string; size: number };
type Cand = { kind: string; nodes: { id: string; x: number; y: number }[]; paths: Record<string, Pt[]>; labels: Record<string, L>; error?: string };
type Golden = { project: unknown; routes: { base: { labels: Record<string, L> }; candidates: Cand[] }; layout: { candidates: Cand[] } };
const golden = (name: string): Golden => JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/layout/__snapshots__/${name}.json`), 'utf8'));
const PERMS: Permissions = { routes: true, blocks: false, ports: false, sides: false, labels: true, scope: 'all', space: 'wide', ids: [] };
const half = (v: number) => Math.round(v * 2) / 2;
const moved = (m: EngineModel, c: Cand): EngineModel => ({ ...m, nodes: m.nodes.map(n => { const x = c.nodes.find(k => k.id === n.id)!; return { ...n, x: x.x, y: x.y }; }) });

/** The widths V2 measured (label w = text width + 10). */
function measureFrom(g: Golden): Measure {
  const widths = new Map<string, number>();
  for (const l of Object.values(g.routes.base.labels)) widths.set(`${l.text}|${l.size}`, l.w - 10);
  return (text, size) => { const w = widths.get(`${text}|${size}`); if (w === undefined) throw new Error(`no V2 width for ${text}`); return w; };
}

for (const name of ['function', 'power', 'scrambled']) {
  describe(`organize labels vs V2 — ${name}`, () => {
    const g = golden(name), d = convertProject(g.project as never).designs[0].data as BlockDiagram;
    const m = fromDiagram(d), measure = measureFrom(g), before = currentPaths(m, routeAll(d));

    it('current labels: texts, sizes and where V2 drew them', () => {
      const live = liveLabels(m, before, measure);
      expect(Object.keys(live).sort()).toEqual(Object.keys(g.routes.base.labels).sort());
      for (const [id, want] of Object.entries(g.routes.base.labels)) {
        const l = live[id];
        expect([l.text, l.size, half(l.w), half(l.h)], id).toEqual([want.text, want.size, want.w, want.h]);
        // where the label sits is where the canvas draws it (render/wires.labelPosition). Known
        // difference on the scrambled diagram: V2's canvas used another segment / nudged labels
        // (later label layers, V2 L3099 de-duplication) — positions compared on the golden diagrams only.
        if (name !== 'scrambled') expect([half(l.x), half(l.y)], id).toEqual([want.x, want.y]);
      }
    });

    for (const mode of ['routes', 'layout'] as const) for (const c of g[mode].candidates) {
      if (c.error || c.kind === 'refined') continue;
      it(`${mode} / ${c.kind}: arranged on the candidate's paths`, () => {
        const mm = moved(m, c), geo = geometry(mm);
        const got = arrangeLabels(mm, c.paths, geo, defaultLabels(mm, c.paths, measure), { ...PERMS, blocks: mode === 'layout' });
        // x of a label beside a vertical segment includes w / 2: the golden's w is rounded to 0.5
        for (const [id, want] of Object.entries(c.labels)) {
          expect(Math.abs(got[id].x - want.x), `${id} x`).toBeLessThanOrEqual(0.5);
          expect(half(got[id].y), `${id} y`).toBe(want.y);
        }
      });
    }
  });
}
