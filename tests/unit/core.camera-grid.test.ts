// module: core — V3 src/core/camera.ts and src/core/grid.ts, checked against V2.10.1 behaviour.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import * as cam from '../../src/core/camera';
import * as grid from '../../src/core/grid';
import { convertProject } from '../tools/v2-to-v3';
import fs from 'node:fs';

// The V1.4 grid helpers (legacy L1475–1503) are not reachable as globals from the page, so
// their exact source is taken from the legacy file and evaluated in the app window.
function v2GridSource(): string {
  const lines = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8').split('\n');
  const at = (prefix: string) => { const i = lines.findIndex(l => l.startsWith(prefix)); if (i < 0) throw new Error(prefix); return i; };
  const start = at('const ggT='), anchor = at('function ggAnchor('), norm = at('function ggNormalize(');
  const end = lines.findIndex((l, i) => i > norm && l === '}');
  return [...lines.slice(start, start + 2), lines[anchor], ...lines.slice(norm, end + 1),
    'return { ggValid, ggSnap, ggOn, ggNormalize };'].join('\n');
}
const V2_GRID = `window.__v2grid = (() => {\n${v2GridSource()}\n})()`;
import type { BlockDiagram } from '../../src/io/schema-types';

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type App = Awaited<ReturnType<typeof openApp>>;
let app: App;
beforeAll(async () => { app = await openApp(); await app.createProject('function'); });
afterAll(async () => { await app?.close(); });

describe('core/camera matches V2', () => {
  it('zoomAt keeps the point under the cursor and clamps like V2 (L322)', async () => {
    const R = rng(7);
    const cases = Array.from({ length: 60 }, () => ({
      c: { x: Math.round(R() * 800 - 400), y: Math.round(R() * 600 - 300), z: 0.2 + R() * 2 },
      z: R() * 3.5,                                   // includes values outside 0.2..2.5
      at: { x: Math.round(R() * 1000), y: Math.round(R() * 700) },
    }));
    const v2 = await app.eval(cs => cs.map(k => {
      const r = view.getBoundingClientRect();
      camera = { ...k.c }; zoomAt(k.z, r.left + k.at.x, r.top + k.at.y); return { ...camera };
    }), cases);
    cases.forEach((k, i) => {
      const v3 = cam.zoomAt(k.c, k.z, k.at);
      expect(v3.z).toBeCloseTo(v2[i].z, 9); expect(v3.x).toBeCloseTo(v2[i].x, 6); expect(v3.y).toBeCloseTo(v2[i].y, 6);
      const before = cam.toWorld(k.c, k.at), after = cam.toWorld(v3, k.at);
      expect(after.x).toBeCloseTo(before.x, 6); expect(after.y).toBeCloseTo(before.y, 6);
    });
  });

  it('fit gives the same camera as V2 fit() on the function example (L336)', async () => {
    const v2 = await app.eval(() => {
      const rects = model.nodes.map(n => { const s = size(n); return { x: n.x, y: n.y, w: s.w, h: s.h }; }).concat(freeTextBounds());
      const points = model.edges.flatMap(e => fullPath(e).ps.map(p => ({ x: p.x, y: p.y })));
      camera = { x: 0, y: 0, z: 1 }; fit();
      return { rects, points, viewport: { w: view.clientWidth, h: view.clientHeight }, camera: { ...camera } };
    });
    expect(v2.rects.length).toBeGreaterThan(3);
    const v3 = cam.fit(cam.unionBounds(v2.rects, v2.points), v2.viewport)!;
    expect(v3.z).toBeCloseTo(v2.camera.z, 9); expect(v3.x).toBeCloseTo(v2.camera.x, 6); expect(v3.y).toBeCloseTo(v2.camera.y, 6);
  });

  it('fit handles empty and degenerate bounds; zoom buttons and wheel', () => {
    expect(cam.fit(null, { w: 800, h: 600 })).toBeNull();
    expect(cam.fit(cam.unionBounds([], []), { w: 800, h: 600 })).toBeNull();
    const one = cam.fit(cam.unionBounds([], [{ x: 50, y: 50 }]), { w: 800, h: 600 })!;   // single point: max zoom, centred
    expect(one.z).toBe(1.1);
    expect(cam.toScreen(one, { x: 50, y: 50 })).toEqual({ x: 400, y: 300 });
    const tiny = cam.fit({ x: 0, y: 0, w: 1e6, h: 10 }, { w: 800, h: 600 })!;
    expect(tiny.z).toBe(cam.ZOOM_MIN);
    const c = cam.zoomBy(cam.IDENTITY, cam.ZOOM_STEP, { w: 800, h: 600 });
    expect(c.z).toBeCloseTo(1.2); expect(cam.toWorld(c, { x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
    expect(cam.wheelFactor(-100)).toBeGreaterThan(1); expect(cam.wheelFactor(100)).toBeLessThan(1);
    expect(cam.centreOn({ x: 0, y: 0, z: 2 }, { x: 10, y: 10 }, { w: 100, h: 100 })).toEqual({ x: 30, y: 30, z: 2 });
    expect(cam.panBy({ x: 1, y: 2, z: 3 }, 10, -2)).toEqual({ x: 11, y: 0, z: 3 });
    expect(cam.transformOf({ x: 5, y: 6, z: 0.5 })).toBe('translate(5px,6px) scale(0.5)');
  });
});

describe('core/grid', () => {
  it('spacing rules match V2 ggValid / ggSnap / ggOn', async () => {
    const vals = [0, 3, 5, 7.5, 10, 15, 25, 40, 45, -5, 12, 20];
    await app.page.evaluate(V2_GRID);
    const v2 = await app.eval(vs => ({
      valid: vs.map(__v2grid.ggValid), snap: vs.map(v => __v2grid.ggSnap(v * 1.37, 10)), on: vs.map(v => __v2grid.ggOn(v, 5)),
    }), vals);
    expect(vals.map(grid.isValidGridSize)).toEqual(v2.valid);
    expect(vals.map(v => grid.snapTo(v * 1.37, 10))).toEqual(v2.snap);
    expect(vals.map(v => grid.isOnGrid(v, 5))).toEqual(v2.on);
    expect(grid.gridSize({ size: 13 })).toBe(10);
    expect(grid.snapIfOn(13, { size: 10, snap: false })).toBe(13);
    expect(grid.snapIfOn(13, { size: 10, snap: true })).toBe(10);
  });

  it('normalize gives the same geometry as V2 ggNormalize on a scrambled example (10 / 20 / 40)', async () => {
    const R = rng(11);
    const file = await app.eval(() => projectData());
    const design = file.designs.find((d: { id: string }) => d.id === file.activeDesignId);
    const m = design.diagram;
    // knock everything off the grid
    const j = () => Math.round(R() * 70) / 10 - 3.5;
    for (const n of m.nodes) { n.x += j(); n.y += j(); n.w += Math.abs(j()); n.h += Math.abs(j()); for (const p of n.ports) delete p.afGridOffset; }
    for (const q of m.junctions || []) { q.x += j(); q.y += j(); }
    const manual = m.edges.find((e: { manual?: unknown }) => !e.manual);
    if (manual) manual.manual = [{ x: 10.4, y: 33.3 }, { x: 10.4, y: 81.7 }, { x: 98.2, y: 81.7 }];
    for (const n of m.nodes) delete n.afLocked;
    for (const e of m.edges) { delete e.afGridLocked; delete e.afLocked; delete e.locked; }
    await app.page.evaluate(V2_GRID);
    const toV3 = (diagram: unknown) => convertProject({ ...file, designs: [{ ...design, diagram }] }).designs[0].data as BlockDiagram;
    const input = toV3(m);

    for (const g of [10, 20, 40]) {
      const v2 = toV3(await app.eval((mm, gg) => __v2grid.ggNormalize(JSON.parse(JSON.stringify(mm)), gg, { locks: false }), m, g));
      const v3 = grid.normalize(input, g, { locks: false });
      expect(v3.grid).toEqual({ size: g, show: true, snap: true });
      for (const b of v2.blocks) {
        const o = v3.blocks.find(x => x.id === b.id)!;
        expect([o.x, o.y, o.w, o.h], b.id).toEqual([b.x, b.y, b.w, b.h]);
        for (const p of b.ports) expect(o.ports.find(x => x.id === p.id)!.t, `${b.id}/${p.id}`).toBeCloseTo(p.t, 9);
      }
      expect(v3.junctions.map(q => [q.x, q.y])).toEqual(v2.junctions.map(q => [q.x, q.y]));
      expect(v3.wires.map(w => w.route ?? null)).toEqual(v2.wires.map(w => w.route ?? null));
      expect(grid.checks(v3).filter(c => !c.pass).map(c => c.id)).toEqual([]);
      expect(input.blocks[0].x).toBe(toV3(m).blocks[0].x);          // input untouched
    }
  });

  it('locks: normalize and protect refuse to move locked items', () => {
    const d: BlockDiagram = {
      blocks: [
        { id: 'A', x: 0, y: 0, w: 200, h: 100, title: 'A', subtitle: '', partNumber: 'PA', ref: 'U1', style: {}, sizing: 'auto', showTitle: true, locked: false, metrics: {},
          ports: [{ id: 'p1', name: '', side: 'r', t: 0.5, type: 'io', label: 'inside', locked: false }] },
        { id: 'B', x: 400, y: 0, w: 200, h: 100, title: 'B', subtitle: '', partNumber: 'PB', ref: 'U2', style: {}, sizing: 'auto', showTitle: true, locked: false, metrics: {},
          ports: [{ id: 'p2', name: '', side: 'l', t: 0.5, type: 'io', label: 'inside', locked: false }] },
      ],
      wires: [{ id: 'w', a: { block: 'A', port: 'p1' }, b: { block: 'B', port: 'p2' }, name: '', kind: 'signal', line: { color: '', width: 2, dash: 'solid', arrow: false }, locked: false }],
      view: 'function', junctions: [], texts: [], frames: [], grid: { size: 10, show: true, snap: true }, wirePresets: [], presentationClean: false,
    };
    expect(() => grid.normalize(d, 7)).toThrow(grid.GridError);
    expect(grid.normalize(d, 10)).toEqual(d);                          // already on the grid: no change

    const off = structuredClone(d); off.blocks[0].x = 3; off.blocks[0].locked = true;
    expect(() => grid.normalize(off, 10)).toThrow(/locked-block: PA/);
    expect(() => grid.normalize(off, 10, { locks: false })).not.toThrow();

    const lp = structuredClone(d); lp.blocks[0].ports[0].t = 0.33; lp.blocks[0].ports[0].locked = true;
    expect(() => grid.normalize(lp, 10)).toThrow(/locked-port: p1/);

    const lw = structuredClone(d); lw.wires[0].locked = true; lw.wires[0].route = [{ x: 200, y: 50 }, { x: 305, y: 50 }];
    expect(() => grid.normalize(lw, 10)).toThrow(/locked-wire/);
    const rr = structuredClone(d); rr.wires[0].route = [{ x: 200, y: 50 }, { x: 300, y: 50 }];
    expect(grid.normalize(rr, 10, { resetRoutes: true }).wires[0].route).toBeUndefined();

    const before = structuredClone(d); before.blocks[1].locked = true;
    const after = structuredClone(before); after.blocks[1].x = 410;
    expect(() => grid.protect(before, after)).toThrow(/locked-block: PB/);
    const bw = structuredClone(d); bw.wires[0].locked = true;
    const aw = structuredClone(bw); aw.blocks[1].y = 20;                // moves the wire's end
    expect(() => grid.protect(bw, aw)).toThrow(/locked-wire/);
    expect(() => grid.protect(d, structuredClone(d))).not.toThrow();
  });

  it('portAt and portPoint agree with V2 project / ggAnchor', async () => {
    const n = { x: 40, y: 60, w: 200, h: 120 };
    const drops = [{ x: 40, y: 61 }, { x: 241, y: 177 }, { x: 47, y: 59 }, { x: 150, y: 181 }, { x: 239, y: 62 }];
    const v2 = await app.eval((nn, ds) => {
      const m = model; const keep = m.afGrid; m.afGrid = { version: 1, size: 20, show: true, enabled: true };
      try { return ds.map(p => { const r = project({ ...nn, ports: [] }, p); return { side: r.side, t: r.t }; }); } finally { m.afGrid = keep; }
    }, n, drops);
    expect(drops.map(p => grid.portAt(n, p, 20))).toEqual(v2);
    const b = { ...n, id: 'n', ports: [] } as never;
    expect(grid.portPoint(b, { side: 'r', t: 0.5 })).toEqual({ x: 240, y: 120 });
    expect(grid.portPoint(b, { side: 't', t: 0.33 }, 20)).toEqual({ x: 100, y: 60 });
  });
});
