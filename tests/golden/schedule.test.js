// module: designs:schedule — golden: the project-schedule example with dates (range and
// deadline), statuses, a milestone and a manual interval; timeline geometry, interval
// labels and SVG export. Text boxes are not part of the fixture: V2.10.1 drops them on
// reload for schedules (KNOWN_LOSS in tests/unit/io.roundtrip.test.js).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { openApp } from '../helpers/load-app.js';
import { loadGolden, svgStructure, goldenDir, json } from './golden.js';

const TYPE = 'schedule';
const snap = name => path.join(goldenDir(TYPE), '__snapshots__', name);

describe('golden: schedule design', () => {
  let app, project;
  beforeAll(async () => {
    app = await openApp();
    project = await loadGolden(app, TYPE, {
      bootstrap: () => {
        const ts = model.nodes;
        const day = i => new Date(Date.UTC(2026, 0, 5) + i * 7 * 864e5).toISOString().slice(0, 10);
        ts.forEach((n, i) => {
          if (i === ts.length - 1) { n.timeType = 'deadline'; n.deadline = day(i * 2 + 1); n.afMilestone = true; }
          else { n.timeType = 'range'; n.startDate = day(i * 2); n.endDate = day(i * 2 + 1); }
          n.afStatus = i === 0 ? 'done' : i === 1 ? 'doing' : 'todo';
        });
        if (model.edges[1]) { model.edges[1].timeMode = 'manual'; model.edges[1].manualDays = '3'; }
        model.texts = [];
        render(); commit();
      },
    });
  });
  afterAll(async () => { await app?.close(); });

  it('the fixture covers ranges, a deadline milestone, statuses and a manual interval', () => {
    const d = project.designs[0].diagram;
    expect(project.designs[0].type).toBe(TYPE);
    expect(d.nodes.some(n => n.timeType === 'range')).toBe(true);
    expect(d.nodes.some(n => n.timeType === 'deadline' && n.afMilestone)).toBe(true);
    expect(new Set(d.nodes.map(n => n.afStatus))).toEqual(new Set(['done', 'doing', 'todo']));
    expect(d.edges.some(e => e.timeMode === 'manual')).toBe(true);
  });

  it('loads without page errors', () => {
    expect(app.errors).toEqual([]);
  });

  it('timeline geometry and interval labels match the golden', async () => {
    const summary = await app.eval(() => {
      const r = v => (typeof v === 'number' ? Math.round(v * 2) / 2 : v);
      return {
        tasks: model.nodes.map(n => ({
          id: n.id, title: n.title, side: n.side, x: r(n.x), y: r(n.y), w: r(n.w), h: r(n.h),
          axis: [r(n.axisX), r(n.axisY)], time: n.timeType, start: n.startDate, end: n.endDate, deadline: n.deadline,
          status: n.afStatus, milestone: !!n.afMilestone,
        })),
        links: model.edges.map(e => ({ id: e.id, from: e.a.node, to: e.b.node, mode: e.timeMode || 'auto', label: intervalState(e).label })),
      };
    });
    await expect(json(summary)).toMatchFileSnapshot(snap('summary.json'));
  });

  it('SVG export matches the golden structurally', async () => {
    const svg = await app.eval(() => exportSvgDocument(false));
    await expect(json({ width: svg.width, height: svg.height, elements: await svgStructure(app, svg.source) })).toMatchFileSnapshot(snap('export.svg.json'));
    await expect(svg.source).toMatchFileSnapshot(snap('export.svg'));
  });
});
