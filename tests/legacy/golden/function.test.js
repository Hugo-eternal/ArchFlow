// module: designs:function — golden: a representative function-block design (LCD module
// template: area frame + FPC connector + blocks, plus a resistor and a ground symbol and a
// text box), its behaviour summary and its SVG export.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { openApp } from '../../helpers/load-app.js';
import { loadGolden, svgStructure, diagramSummary, goldenDir, json } from '../../golden/golden.js';

const TYPE = 'function';
const snap = name => path.join(goldenDir(TYPE), '__snapshots__', name);

describe('golden: function design', () => {
  let app, project;
  beforeAll(async () => {
    app = await openApp();
    project = await loadGolden(app, TYPE, {
      bootstrap: async () => {
        // start from an empty design, then add the LCD template and two schematic symbols
        model = { nodes: [], edges: [], junctions: [], texts: [] }; render(); commit();
        afTpl.lcd();
        await new Promise(r => setTimeout(r, 300));
        afLib.insert('res', { x: 1100, y: 120 });
        afLib.insert('gnd', { x: 1100, y: 320 });
        await new Promise(r => setTimeout(r, 300));
        model.texts = [{ id: 'goldtext1', text: 'Golden: LCD module', x: 40, y: -80, w: 400, size: 18, color: '#14202C', bold: true, italic: false }];
        render(); commit();
      },
    });
  });
  afterAll(async () => { await app?.close(); });

  it('the fixture covers frames, connectors, symbols and text', () => {
    const d = project.designs[0].diagram;
    expect(project.designs[0].type).toBe(TYPE);
    expect(d.afFrames?.length).toBeGreaterThan(0);
    expect(d.nodes.some(n => n.afConn)).toBe(true);
    expect(d.nodes.some(n => n.afSym)).toBe(true);
    expect(d.texts.length).toBeGreaterThan(0);
  });

  it('loads without page errors', () => {
    expect(app.errors).toEqual([]);
  });

  it('behaviour summary (geometry, ports, routes) matches the golden', async () => {
    await expect(json(await diagramSummary(app))).toMatchFileSnapshot(snap('summary.json'));
  });

  it('SVG export matches the golden structurally', async () => {
    const svg = await app.eval(() => exportSvgDocument(false));
    await expect(json({ width: svg.width, height: svg.height, elements: await svgStructure(app, svg.source) })).toMatchFileSnapshot(snap('export.svg.json'));
    // the raw SVG is kept next to it for human review (not compared byte-for-byte)
    await expect(svg.source).toMatchFileSnapshot(snap('export.svg'));
  });
});
