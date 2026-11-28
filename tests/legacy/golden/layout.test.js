// module: layout — golden for the auto-arrange port (3.37, docs/v3-layout-callgraph.md): V2.10.1's
// organize engine (RC4) on the golden function / power diagrams and on the starter diagram with
// scrambled blocks, read from the organize dialog through window.ArchFlowRC4.plan() (the engine is
// closed over). For each: the V2 project, and for routes mode and layout mode the original (base:
// geometry, current paths, labels, metrics) and every candidate (preserved / expanded / layered and
// the wire-by-wire refinement): block positions, paths, labels, metrics, change counts. The V3 port must reproduce
// these from the same input (tests/unit/layout.*.test.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from '../../helpers/load-app.js';
import { loadGolden, goldenDir, json } from '../../golden/golden.js';


const snap = name => path.join(goldenDir('layout'), '__snapshots__', `${name}.json`);
const SCRAMBLED = [[700, 400], [60, 420], [720, 40], [80, 60]];

/** The organize plan of the current dialog, made compact (inside the V2 app; the engine is closed
 *  over, window.ArchFlowRC4.plan() is its only window). */
function readPlan() {
  const r = v => (typeof v === 'number' ? Math.round(v * 2) / 2 : v);
  const pts = ps => (ps || []).map(p => ({ x: r(p.x), y: r(p.y) }));
  const paths = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, pts(v)]));
  const lab = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v).map(([k, v]) => [k, { x: r(v.x), y: r(v.y), w: r(v.w), h: r(v.h), text: v.text, size: v.size, angle: v.angle ?? 0 }]));
  const met = m => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, r(v)]));
  const geo = g => ({ grid: g.grid, boxes: g.boxes.map(b => ({ id: b.id, x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) })), anchors: Object.fromEntries(Object.entries(g.anchors).map(([k, v]) => [k, { x: r(v.x), y: r(v.y) }])) });
  const plan = window.ArchFlowRC4.plan();
  return {
    mode: plan.mode,
    base: { geo: geo(plan.base.geo), paths: paths(plan.base.paths), labels: lab(plan.base.labels), metrics: met(plan.base.metrics) },
    candidates: plan.candidates.slice(1).map(p => ({
      kind: p.kind,
      nodes: p.m.nodes.map(n => ({ id: n.id, x: r(n.x), y: r(n.y), ports: n.ports.map(q => ({ id: q.id, side: q.side, t: q.t, off: q.afGridOffset ?? null })) })),
      geo: geo(p.geo), paths: paths(p.paths), labels: lab(p.labels), metrics: met(p.metrics),
      changes: Object.fromEntries(Object.entries(p.changes || {}).map(([k, v]) => [k, v.length])),
    })),
    errors: plan.errors,
  };
}

const waitDone = app => app.page.waitForFunction(() => /完成/.test(document.getElementById('v4Status').textContent), null, { timeout: 60000 });

async function capture(app) {
  // applicationVersion is AF_VERSION (checked in io.roundtrip); keep it out of the layout golden
  const out = { project: await app.eval(() => ({ ...projectData(), applicationVersion: '<AF_VERSION>' })) };
  await app.eval(() => autoArrange());
  await waitDone(app);
  out.routes = await app.eval(readPlan);
  await app.page.selectOption('#v4Mode', 'layout');
  await app.page.waitForTimeout(300);
  await waitDone(app);
  out.layout = await app.eval(readPlan);
  await app.eval(() => { const d = document.getElementById('v4Dialog'); if (d.open) d.close(); });
  return out;
}

describe('golden: V2.10.1 organize engine (RC4)', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const type of ['function', 'power']) {
    it(`${type} golden diagram`, async () => {
      await loadGolden(app, type);
      const out = await capture(app);
      await expect(json(out)).toMatchFileSnapshot(snap(type));
    }, 60000);
  }

  it('starter diagram with scrambled blocks', async () => {
    // a fixed file (ids are random on creation): made once, then always loaded like loadGolden
    const file = path.join(goldenDir('layout'), 'scrambled.project.json');
    if (!fs.existsSync(file)) {
      await app.createProject('function');
      await app.eval(pos => { model.nodes.forEach((n, i) => { n.x = pos[i][0]; n.y = pos[i][1]; }); for (const e of model.edges) e.manual = null; render(); commit(); }, SCRAMBLED);
      fs.writeFileSync(file, JSON.stringify(await app.eval(() => projectData()), null, 2) + '\n');
    }
    await app.createProject('function');
    const onDialog = d => d.accept().catch(() => {});
    app.page.on('dialog', onDialog);
    await app.page.setInputFiles('#file', { name: 'scrambled.json', mimeType: 'application/json', buffer: fs.readFileSync(file) });
    await app.page.waitForTimeout(800);
    app.page.off('dialog', onDialog);
    const out = await capture(app);
    await expect(json(out)).toMatchFileSnapshot(snap('scrambled'));
  }, 60000);
});
