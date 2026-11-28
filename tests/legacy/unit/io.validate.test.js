// module: io — validateDiagram (V2.10.1 L358 + 28 override layers) and the project-file size guard.
// Locks CURRENT behaviour, including quirks noted inline (do not "fix" here; see plan §3.1 R10).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('validateDiagram', () => {
  let app;
  // run a mutation against a fresh copy of the function example and validate it
  const check = (mutate) => app.eval((src) => {
    const d = clone(projectData().designs[0].diagram);
    try { (0, eval)('(' + src + ')')(d); const v = validateDiagram(d); return { ok: true, nodes: v.nodes.length, edges: v.edges.length, v }; }
    catch (e) { return { ok: false, message: String(e && e.message) }; }
  }, mutate.toString());

  beforeAll(async () => { app = await openApp(); await app.createProject('function'); });
  afterAll(async () => { await app?.close(); });

  it('accepts the saved example unchanged', async () => {
    const r = await check(() => {});
    expect(r.ok).toBe(true);
    expect([r.nodes, r.edges]).toEqual([4, 3]);
  });

  it('rejects input that is not a diagram', async () => {
    expect((await app.eval(() => { try { validateDiagram(null); return 'ok' } catch (e) { return 'throw' } }))).toBe('throw');
    expect((await check(d => { delete d.nodes; })).ok).toBe(false);
    expect((await check(d => { d.edges = 'x'; })).ok).toBe(false);
  });

  it('accepts 100 blocks and rejects 101', async () => {
    const grid = n => d => {
      const proto = d.nodes[0];
      d.edges = []; d.junctions = [];
      d.nodes = Array.from({ length: n }, (_, i) => ({ ...JSON.parse(JSON.stringify(proto)), id: 'n' + i, ref: 'U' + i, ports: [], x: (i % 10) * 400, y: Math.floor(i / 10) * 300 }));
    };
    const r100 = await check(new Function('d', `(${grid.toString()})(100)(d)`));
    expect(r100.ok, r100.message).toBe(true);
    expect(r100.nodes).toBe(100);
    expect((await check(new Function('d', `(${grid.toString()})(101)(d)`))).ok).toBe(false);
  });

  it('rejects more than 400 wires', async () => {
    expect((await check(d => { d.edges = Array.from({ length: 401 }, (_, i) => ({ ...d.edges[0], id: 'e' + i })); })).ok).toBe(false);
  });

  it('rejects overlapping blocks', async () => {
    const r = await check(d => { d.nodes[1].x = d.nodes[0].x; d.nodes[1].y = d.nodes[0].y; });
    expect(r.ok).toBe(false);
  });

  it('rejects bad ids, duplicate ids and non-numeric coordinates', async () => {
    expect((await check(d => { d.nodes[1].id = d.nodes[0].id; })).ok).toBe(false);
    expect((await check(d => { d.nodes[0].id = 'bad id!'; })).ok).toBe(false);
    expect((await check(d => { d.nodes[0].x = 'abc'; })).ok).toBe(false);
  });

  it('rejects wires pointing at missing blocks or ports', async () => {
    expect((await check(d => { d.edges[0].a = { node: 'nope', port: 'p' }; })).ok).toBe(false);
    expect((await check(d => { d.edges[0].a = { ...d.edges[0].a, port: 'nope' }; })).ok).toBe(false);
  });

  it('drops unknown fields', async () => {
    const r = await check(d => { d.nodes[0].zzz = 1; d.zzz = 2; });
    expect(r.ok).toBe(true);
    expect(r.v.nodes[0].zzz).toBeUndefined();
    expect(r.v.zzz).toBeUndefined();
  });

  it('QUIRK: does not cap block title length', async () => {
    const r = await check(d => { d.nodes[0].title = 'x'.repeat(5000); });
    expect(r.ok).toBe(true);
    expect(r.v.nodes[0].title.length).toBe(5000);
  });
});

describe('project file size guard', () => {
  let app;
  beforeAll(async () => { app = await openApp(); await app.createProject('function'); });
  afterAll(async () => { await app?.close(); });

  it('refuses files larger than 8 MB and keeps the open project', async () => {
    const before = await app.eval(() => JSON.stringify(projectData().designs.map(d => d.diagram)));
    const message = new Promise(resolve => app.page.once('dialog', async d => { const m = d.message(); await d.dismiss(); resolve(m); }));
    await app.page.setInputFiles('#file', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(8_000_001, 32) });
    // v2-fix B3: V2.10.1's outer loader (L2332) showed only the generic '載入失敗，原專案已保留。'
    expect(await message).toBe('載入失敗：檔案超過 8 MB。原專案已保留。');
    expect(await app.eval(() => JSON.stringify(projectData().designs.map(d => d.diagram)))).toBe(before);
  });

  for (const [name, body, text] of [
    ['not JSON', '{ not json', '載入失敗：檔案不是有效的 JSON。原專案已保留。'],
    ['JSON that is not a project', '42', '載入失敗：檔案不是 ArchFlow 專案。原專案已保留。'],
  ]) {
    it(`says why a file is refused: ${name}`, async () => {
      const before = await app.eval(() => JSON.stringify(projectData().designs.map(d => d.diagram)));
      const message = new Promise(resolve => app.page.once('dialog', async d => { const m = d.message(); await d.dismiss(); resolve(m); }));
      await app.page.setInputFiles('#file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(body) });
      expect(await message).toBe(text);
      expect(await app.eval(() => JSON.stringify(projectData().designs.map(d => d.diagram)))).toBe(before);
    });
  }

  it('English: the 8 MB message names the reason', async () => {
    const en = await openApp({ locale: 'en' });
    try {
      await en.createProject('function');
      const message = new Promise(resolve => en.page.once('dialog', async d => { const m = d.message(); await d.dismiss(); resolve(m); }));
      await en.page.setInputFiles('#file', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(8_000_001, 32) });
      expect(await message).toBe('Load failed: the file is larger than 8 MB. The current project was preserved.');
    } finally { await en.close(); }
  });
});
