// module: designs:power — golden: the power-architecture example (sources, converters,
// loads, branch voltage / current) with one negative rail, the downstream-demand readout
// (V2.2.4), its behaviour summary and its SVG export.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { openApp } from '../../helpers/load-app.js';
import { loadGolden, svgStructure, diagramSummary, goldenDir, json } from '../../golden/golden.js';

const TYPE = 'power';
const snap = name => path.join(goldenDir(TYPE), '__snapshots__', name);

describe('golden: power design', () => {
  let app, project;
  beforeAll(async () => {
    app = await openApp();
    project = await loadGolden(app, TYPE, {
      bootstrap: () => {
        // the example's input block becomes an explicit source with a current rating
        const input = model.nodes[0];
        input.role = 'source'; input.current = '3';
        // loads draw current so sources / converters have downstream demand (V2.2.4)
        model.nodes.filter(n => n.role === 'load').forEach((n, i) => { n.current = String(0.4 + i * 0.3); });
        // V2.2.4: negative rails are accepted — give the last load a −12 V rail
        const load = model.nodes.filter(n => n.role === 'load').at(-1);
        load.voltage = '-12'; load.showMetrics = { ...(load.showMetrics || {}), voltage: true, current: true };
        // branch values on the first two wires so wire labels carry electrical text
        model.edges[0].voltage = '12'; model.edges[0].current = '1';
        model.edges[1].voltage = '5'; model.edges[1].current = '0.9';
        render(); commit();
      },
    });
  });
  afterAll(async () => { await app?.close(); });

  it('the fixture covers every power role and electrical values on wires', () => {
    const d = project.designs[0].diagram;
    expect(project.designs[0].type).toBe(TYPE);
    const roles = new Set(d.nodes.map(n => n.role));
    for (const r of ['source', 'converter', 'load']) expect(roles.has(r), r).toBe(true);
    expect(d.edges.some(e => e.voltage || e.current)).toBe(true);
    expect(d.nodes.some(n => String(n.voltage).startsWith('-'))).toBe(true);
  });

  it('loads without page errors', () => {
    expect(app.errors).toEqual([]);
  });

  it('behaviour summary matches the golden, including metrics and demand readouts', async () => {
    const summary = await diagramSummary(app);
    const extra = await app.eval(() => ({
      metrics: model.nodes.map(n => ({ id: n.id, role: n.role, voltage: n.voltage, current: n.current, power: n.power, efficiency: n.efficiency })),
      wireLabels: model.edges.map(e => ({ id: e.id, label: edgeLabel(e) })),
    }));
    // the demand-vs-rating readout appears in the inspector of a selected source / converter
    extra.demand = [];
    for (const id of await app.eval(() => model.nodes.filter(n => n.role === 'source' || n.role === 'converter').map(n => n.id))) {
      await app.eval(id => select({ type: 'node', id }), id);
      await app.page.waitForTimeout(300);
      extra.demand.push({ id, readout: await app.eval(() => [...document.querySelectorAll('.af24-load')].map(el => el.textContent.replace(/\s+/g, ' ').trim())) });
    }
    await app.eval(() => select(null));
    await expect(json({ ...summary, ...extra })).toMatchFileSnapshot(snap('summary.json'));
  });

  it('SVG export matches the golden structurally', async () => {
    const svg = await app.eval(() => exportSvgDocument(false));
    await expect(json({ width: svg.width, height: svg.height, elements: await svgStructure(app, svg.source) })).toMatchFileSnapshot(snap('export.svg.json'));
    await expect(svg.source).toMatchFileSnapshot(snap('export.svg'));
  });
});
