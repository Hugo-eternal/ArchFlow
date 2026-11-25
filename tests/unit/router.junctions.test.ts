// module: router — V3 src/router/junctions.ts, checked against V2.10.1 afCleanJunctions (L1085)
// on random topologies and on the golden power project.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { openApp } from '../helpers/load-app.js';
import { cleanJunctions, junctionDegrees } from '../../src/router/junctions';
import * as m from '../../src/model/diagram';
import type { BlockDiagram, Wire, WireEnd } from '../../src/io/schema-types';

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// afCleanJunctions is not a page global: evaluate its exact source in the page.
const V2_CLEAN = (() => {
  const lines = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8').split('\n');
  const i = lines.findIndex(l => l.startsWith('function afCleanJunctions(')), end = lines.findIndex((l, k) => k > i && l === '}');
  return `window.__v2clean = (() => {\n${lines.slice(i, end + 1).join('\n')}\nreturn afCleanJunctions;\n})()`;
})();

// V3 diagram → the V2 fields afCleanJunctions reads
const toV2End = (e: WireEnd) => ('junction' in e ? { junction: e.junction } : { node: e.block, port: e.port });
const toV2 = (d: BlockDiagram) => ({
  nodes: d.blocks.map(b => ({ id: b.id, ports: b.ports.map(p => ({ id: p.id })) })),
  junctions: d.junctions.map(j => ({ id: j.id, x: j.x, y: j.y })),
  edges: d.wires.map(w => ({ id: w.id, a: toV2End(w.a), b: toV2End(w.b), name: w.name, arrow: w.line.arrow, manual: w.route ?? null })),
});
const summary = (d: BlockDiagram) => ({
  junctions: d.junctions.map(j => j.id),
  edges: d.wires.map(w => ({ id: w.id, a: toV2End(w.a), b: toV2End(w.b), name: w.name, arrow: w.line.arrow, manual: w.route ?? null })),
});

function randomDiagram(seed: number): BlockDiagram {
  const R = rng(seed);
  let d = m.emptyDiagram();
  const nb = 2 + Math.floor(R() * 3);
  for (let i = 0; i < nb; i++) d = m.addBlock(d, { ...m.makeBlock(d, { x: i * 300, y: 0 }), id: 'b' + i }).data;
  const nj = Math.floor(R() * 5);
  for (let i = 0; i < nj; i++) d.junctions.push({ id: 'j' + i, x: i * 10, y: 100, name: '' });
  const ends: WireEnd[] = [
    ...d.blocks.flatMap(b => b.ports.map(p => ({ block: b.id, port: p.id }))),
    ...d.junctions.map(j => ({ junction: j.id })),
    { block: 'b0', port: 'gone' }, { junction: 'jx' },           // dangling ends
  ];
  const pick = () => ends[Math.floor(R() * (ends.length - (R() < 0.9 ? 2 : 0)))];
  const nw = 2 + Math.floor(R() * 8);
  for (let i = 0; i < nw; i++) {
    const w: Wire = { id: 'w' + i, a: pick(), b: pick(), name: R() < 0.3 ? 'N' + i : '', kind: 'signal', line: { color: '', width: 2, dash: 'solid', arrow: R() < 0.5 }, locked: false };
    if (R() < 0.3) w.route = [{ x: 10, y: 10 }, { x: 10, y: 50 }];
    d.wires.push(w);
  }
  return d;
}

describe('router/junctions matches V2 afCleanJunctions', () => {
  let app: Awaited<ReturnType<typeof openApp>>;
  beforeAll(async () => { app = await openApp(); await app.page.evaluate(V2_CLEAN); });
  afterAll(async () => { await app?.close(); });

  it('300 random topologies give the same wires and junctions', async () => {
    const ds = Array.from({ length: 300 }, (_, i) => randomDiagram(i + 1));
    const v2 = await app.eval(list => list.map(d => { const r = __v2clean(d); return { junctions: r.junctions.map(j => j.id), edges: r.edges.map(e => ({ id: e.id, a: e.a, b: e.b, name: e.name, arrow: !!e.arrow, manual: e.manual ?? null })) }; }), ds.map(toV2));
    const v3 = ds.map(d => summary(cleanJunctions(d).data));
    expect(v3).toEqual(v2);
    // the random cases cover every rule
    expect(ds.filter((d, i) => v3[i].edges.length < d.wires.length).length).toBeGreaterThan(100);
    expect(ds.filter((d, i) => v3[i].junctions.length < d.junctions.length).length).toBeGreaterThan(50);
    expect(ds.filter((d, i) => v3[i].junctions.length > 0).length).toBeGreaterThan(20);
  });
});

describe('router/junctions', () => {
  it.each(['function', 'power'])('the golden %s project is already clean', type => {
    const f = JSON.parse(fs.readFileSync(`tests/golden/${type}/__snapshots__/project.v3.json`, 'utf8'));
    const d = f.designs[0].data as BlockDiagram;
    const r = cleanJunctions(d);
    expect(r.changed).toBe(false);
    expect(r.data).toEqual(d);
    expect([...junctionDegrees(d).values()].every(n => n >= 3)).toBe(true);
  });

  it('a two-wire junction merges into one wire keeping the first id and format', () => {
    let d = m.emptyDiagram();
    const A = { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A' }; d = m.addBlock(d, A).data;
    const B = { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'B' }; d = m.addBlock(d, B).data;
    d.junctions.push({ id: 'J', x: 300, y: 50, name: '' });
    d.wires.push(
      { id: 'w1', a: { block: 'A', port: A.ports[1].id }, b: { junction: 'J' }, name: '', kind: 'power', line: { color: 'red', width: 3, dash: 'dash', arrow: false }, locked: false, route: [{ x: 250, y: 50 }] },
      { id: 'w2', a: { junction: 'J' }, b: { block: 'B', port: B.ports[0].id }, name: 'VIN', kind: 'signal', line: { color: '', width: 2, dash: 'solid', arrow: true }, locked: false },
    );
    const r = cleanJunctions(d);
    expect(r.changed).toBe(true);
    expect(r.data.junctions).toEqual([]);
    expect(r.data.wires).toEqual([{ id: 'w1', a: { block: 'A', port: A.ports[1].id }, b: { block: 'B', port: B.ports[0].id }, name: 'VIN', kind: 'power', line: { color: 'red', width: 3, dash: 'dash', arrow: true }, locked: false }]);
    expect(d.junctions).toHaveLength(1);                                   // input untouched
  });
});
