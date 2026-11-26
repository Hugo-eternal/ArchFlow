// module: designs:sequence — golden: the built-in power-sequence example (vendor React
// editor in #af2-seq-frame, data in model.sequence, see audit §5.2): document, timing
// table, rendered chart and export preview SVG.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { openApp } from '../helpers/load-app.js';
import { loadGolden, svgStructure, goldenDir, json, missingFrom } from './golden.js';

const TYPE = 'sequence';
const snap = name => path.join(goldenDir(TYPE), '__snapshots__', name);

// run fn(win) inside the sequence editor iframe
const inEditor = (app, fn) => app.page.evaluate(async src => {
  const f = [...document.querySelectorAll('iframe')].find(x => x.contentWindow?.afSeqApi);
  return (0, eval)('(' + src + ')')(f.contentWindow);
}, fn.toString());

describe('golden: sequence design', () => {
  let app, project;
  beforeAll(async () => {
    // the export preview prints today's date: fix it to the day the golden was recorded
    app = await openApp({ now: new Date(2026, 10, 25, 12, 0, 0) });
    project = await loadGolden(app, TYPE);
    await app.page.waitForTimeout(1200);
  });
  afterAll(async () => { await app?.close(); });

  it('the fixture has rails with power-on and power-off timing', () => {
    const doc = project.designs[0].diagram.sequence;
    expect(project.designs[0].type).toBe(TYPE);
    expect(doc.rails.length).toBeGreaterThan(3);
    expect(doc.rails.every(r => r.on && r.off)).toBe(true);
  });

  it('loads into the editor without page errors', async () => {
    expect(app.errors).toEqual([]);
    const doc = await inEditor(app, w => w.afSeqApi.getDoc());
    // the editor fills defaults (e.g. on/off.edge = 'end') but keeps every saved value
    expect(missingFrom(project.designs[0].diagram.sequence, doc)).toEqual([]);
  });

  it('the copied timing table matches the golden', async () => {
    const table = await inEditor(app, async w => {
      // copyTable() writes a rich ClipboardItem (HTML for Word / Excel, plus plain text)
      let copied = null;
      Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: {
        writeText: async t => { copied = { 'text/plain': t }; },
        write: async items => {
          copied = {};
          for (const item of items) for (const type of item.types) copied[type] = await (await item.getType(type)).text();
        },
      } });
      await w.afSeqApi.copyTable();
      await new Promise(r => setTimeout(r, 300));
      return copied;
    });
    expect(table && typeof table['text/plain']).toBe('string');
    await expect(table['text/plain']).toMatchFileSnapshot(snap('table.txt'));
    if (table['text/html']) await expect(table['text/html']).toMatchFileSnapshot(snap('table.html'));
  });

  it('the rendered chart and the export preview match the golden structurally', async () => {
    const svgs = await inEditor(app, async w => {
      const big = s => s.outerHTML.length > 2000;
      const chart = [...w.document.querySelectorAll('svg')].find(s => big(s) && !s.closest('[role=dialog],dialog,.modal'));
      w.afSeqApi.openExport();
      await new Promise(r => setTimeout(r, 800));
      const preview = [...w.document.querySelectorAll('svg')].find(s => big(s) && s.closest('[role=dialog],dialog,.modal'));
      const ser = s => (s ? new w.XMLSerializer().serializeToString(s) : null);
      return { chart: ser(chart), preview: ser(preview) };
    });
    expect(svgs.chart).toBeTruthy();
    expect(svgs.preview).toBeTruthy();
    await expect(json(await svgStructure(app, svgs.chart))).toMatchFileSnapshot(snap('chart.svg.json'));
    await expect(json(await svgStructure(app, svgs.preview))).toMatchFileSnapshot(snap('export-preview.svg.json'));
    await expect(svgs.preview).toMatchFileSnapshot(snap('export-preview.svg'));
  });
});
