// module: designs:flowchart — golden: the built-in flowchart example (vendor React editor
// in #af2-flow-frame, data in model.flowchart, see audit §5.2): document, rendered canvas,
// and the three text exports from the editor's export menu (SVG, Mermaid, .flow.json).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { openApp } from '../helpers/load-app.js';
import { loadGolden, svgStructure, goldenDir, json, missingFrom } from './golden.js';

const TYPE = 'flowchart';
const snap = name => path.join(goldenDir(TYPE), '__snapshots__', name);

describe('golden: flowchart design', () => {
  let app, project, frame;
  // Open the export menu and click one entry (matched by the start of its label) inside the
  // editor iframe. Anchor downloads and clipboard writes are captured in the iframe itself.
  const runExport = label => app.page.evaluate(async label => {
    const w = [...document.querySelectorAll('iframe')].find(x => x.contentWindow?.afFlowApi).contentWindow;
    const out = { files: [], clipboard: null };
    const blobs = new Map();
    const origCreate = w.URL.createObjectURL, origClick = w.HTMLAnchorElement.prototype.click;
    w.URL.createObjectURL = b => { const u = origCreate.call(w.URL, b); blobs.set(u, b); return u; };
    w.HTMLAnchorElement.prototype.click = function () { if (this.download) out.files.push({ name: this.download, blob: blobs.get(this.href) }); else origClick.call(this); };
    Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async t => { out.clipboard = t; } } });
    try {
      w.afFlowApi.openExport();
      await new Promise(r => setTimeout(r, 300));
      const btn = [...w.document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim().startsWith(label));
      if (!btn) throw new Error('export item not found: ' + label);
      btn.click();
      await new Promise(r => setTimeout(r, 600));
    } finally {
      w.URL.createObjectURL = origCreate; w.HTMLAnchorElement.prototype.click = origClick;
    }
    return { clipboard: out.clipboard, files: await Promise.all(out.files.map(async f => ({ name: f.name, text: f.blob ? await f.blob.text() : null }))) };
  }, label);
  const download = async label => {
    const r = await runExport(label);
    expect(r.files.length, label).toBe(1);
    return r.files[0];
  };

  beforeAll(async () => {
    app = await openApp();
    project = await loadGolden(app, TYPE);
    await app.page.waitForTimeout(1200);
    frame = app.page.frameLocator('#af2-flow-frame');
  });
  afterAll(async () => { await app?.close(); });

  it('the fixture has decisions, several shapes and labelled edges', () => {
    const doc = project.designs[0].diagram.flowchart;
    expect(project.designs[0].type).toBe(TYPE);
    expect(new Set(doc.nodes.map(n => n.type)).size).toBeGreaterThan(2);
    expect(doc.nodes.some(n => n.type === 'decision')).toBe(true);
    expect(doc.edges.some(e => e.label)).toBe(true);
  });

  it('loads into the editor without page errors and keeps every saved value', async () => {
    expect(app.errors).toEqual([]);
    const doc = await app.eval(() => model.flowchart);
    expect(missingFrom(project.designs[0].diagram.flowchart, doc)).toEqual([]);
  });

  it('the rendered canvas matches the golden structurally', async () => {
    const svg = await app.page.evaluate(() => {
      const w = [...document.querySelectorAll('iframe')].find(x => x.contentWindow?.afFlowApi).contentWindow;
      return new w.XMLSerializer().serializeToString(w.document.querySelector('svg.fl-svg'));
    });
    await expect(json(await svgStructure(app, svg))).toMatchFileSnapshot(snap('canvas.svg.json'));
  });

  it('SVG export matches the golden', async () => {
    const d = await download('SVG');
    expect(d.name).toMatch(/\.svg$/);
    await expect(json(await svgStructure(app, d.text))).toMatchFileSnapshot(snap('export.svg.json'));
    await expect(d.text).toMatchFileSnapshot(snap('export.svg'));
  });

  it('.flow.json export matches the golden', async () => {
    const d = await download('JSON');
    expect(d.name).toMatch(/\.flow\.json$/);
    const data = JSON.parse(d.text);
    expect(data.app).toBe('archflow-flow');
    await expect(json(data)).toMatchFileSnapshot(snap('export.flow.json'));
  });

  it('Mermaid export matches the golden', async () => {
    const { clipboard: text } = await runExport('Mermaid');
    expect(text).toMatch(/^flowchart|^graph/);
    await expect(text).toMatchFileSnapshot(snap('export.mmd'));
  });
});
