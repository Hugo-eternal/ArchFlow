// module: router — V3 src/router/find-path.ts, checked against the three V2.10.1 searches
// (findPath L274, afFindRoute L1209, ggFind L1518) on the same random inputs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { openApp } from '../helpers/load-app.js';
import { findPath, gridSearch, freeSearch, BASIC_SEARCH, gridBoxes, type Segment } from '../../src/router/find-path';
import { clear, inside, type Point, type Rect } from '../../src/core/geometry';

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ggFind / afRouteCost / afFindRoute are not page globals: evaluate their exact source in the
// page, with the wire segments and junctions passed in instead of V2's globals.
const V2_SEARCH = (() => {
  const lines = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8').split('\n');
  const at = (prefix: string) => { const i = lines.findIndex(l => l.startsWith(prefix)); if (i < 0) throw new Error(prefix); return i; };
  const g = at('function ggFind('), gEnd = lines.findIndex((l, i) => i > g && l === '}');
  return `window.__v2search = {
    ggFind: (() => { ${lines.slice(g, gEnd + 1).join('\n')}\n return ggFind; })(),
    afFindRoute: (start, end, rects, segments, junctions) => {
      const model = { junctions }, afWireSegments = segments;
      ${lines[at('function afRouteCost(')]}
      ${lines[at('function afFindRoute(')]}
      return afFindRoute(start, end, rects);
    },
  };`;
})();

interface Case { start: Point; end: Point; rects: Rect[]; segments: Segment[]; junctions: Point[] }

function cases(seed: number, n: number, step: number): Case[] {
  const R = rng(seed), q = (k: number) => Math.round(R() * k) * step;
  const out: Case[] = [];
  while (out.length < n) {
    const rects: Rect[] = Array.from({ length: 1 + Math.floor(R() * 5) }, (_, i) => {
      const l = q(40), t = q(30); return { id: 'r' + i, l, t, r: l + step * (2 + Math.floor(R() * 8)), b: t + step * (2 + Math.floor(R() * 6)) };
    });
    const pt = () => ({ x: q(46) - 3 * step, y: q(36) - 3 * step });
    const start = pt(), end = pt();
    if (rects.some(r => inside(start, r) || inside(end, r))) continue;     // V3 and V2 both return null; keep the cases useful
    const segments: Segment[] = Array.from({ length: Math.floor(R() * 4) }, () => {
      const a = pt(); return [a, R() < 0.5 ? { x: a.x, y: q(36) } : { x: q(46), y: a.y }] as Segment;
    });
    out.push({ start, end, rects, segments, junctions: R() < 0.5 ? [pt()] : [] });
  }
  return out;
}

const legal = (ps: Point[], c: Case) => ps.length >= 1 && ps.slice(1).every((p, i) => clear(ps[i], p, c.rects))
  && ps[0].x === c.start.x && ps[0].y === c.start.y && ps.at(-1)!.x === c.end.x && ps.at(-1)!.y === c.end.y;

describe('router/find-path matches V2', () => {
  let app: Awaited<ReturnType<typeof openApp>>;
  beforeAll(async () => { app = await openApp(); await app.page.evaluate(V2_SEARCH); });
  afterAll(async () => { await app?.close(); });

  it('GRID preset = V2 ggFind on 150 random cases (grid 10 and 20)', async () => {
    for (const g of [10, 20]) {
      const cs = cases(g, 75, g);
      const v2 = await app.eval((list, gg) => list.map(c => __v2search.ggFind(c.start, c.end, c.rects, gg, c.segments)), cs, g);
      const v3 = cs.map(c => findPath(c.start, c.end, c.rects, gridSearch(g, c.segments)));
      expect(v3).toEqual(v2);
      expect(v3.filter(Boolean).length).toBeGreaterThan(60);
      v3.forEach((ps, i) => { if (ps) expect(legal(ps, cs[i])).toBe(true); });
    }
  });

  it('FREE preset = V2 afFindRoute + afRouteCost on 150 random cases', async () => {
    const cs = cases(3, 150, 7);                                       // off-grid coordinates
    const v2 = await app.eval(list => list.map(c => __v2search.afFindRoute(c.start, c.end, c.rects, c.segments, c.junctions)), cs);
    const v3 = cs.map(c => findPath(c.start, c.end, c.rects, freeSearch(c.segments, c.junctions)));
    expect(v3).toEqual(v2);
    expect(v3.filter(ps => ps && ps.length > 2).length).toBeGreaterThan(50);
  });

  it('BASIC preset = V2 findPath on 150 random cases', async () => {
    const cs = cases(5, 150, 10);
    const v2 = await app.eval(list => list.map(c => (window as any).findPath(c.start, c.end, c.rects)), cs);
    expect(cs.map(c => findPath(c.start, c.end, c.rects, BASIC_SEARCH))).toEqual(v2);
  });

  it('gridBoxes = V2 ggBoxes', async () => {
    const blocks = [{ id: 'a', x: 13, y: -7, w: 201, h: 95 }, { id: 'b', x: 300, y: 40, w: 120, h: 60 }];
    const src = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8').split('\n').find(l => l.startsWith('function ggBoxes('))!;
    const v2 = await app.eval((s, bs) => { const ggBoxes = (0, eval)('(' + s.replace(/^function ggBoxes/, 'function') + ')'); return [ggBoxes({ nodes: bs }, 10, 10), ggBoxes({ nodes: bs }, 20, 0)]; }, src, blocks);
    expect([gridBoxes(blocks, 10, 10), gridBoxes(blocks, 20, 0)]).toEqual(v2);
  });
});

describe('router/find-path', () => {
  it('an existing wire on the straight line makes the route detour (overlap cost > two bends)', () => {
    const start = { x: 0, y: 0 }, end = { x: 200, y: 0 };
    expect(findPath(start, end, [], gridSearch(10))).toEqual([start, end]);
    const busy: Segment[] = [[{ x: 0, y: 0 }, { x: 200, y: 0 }]];
    const ps = findPath(start, end, [], gridSearch(10, busy))!;
    expect(ps.length).toBe(4);
    expect(ps.slice(1, -1).every(p => p.y !== 0)).toBe(true);
    // free mode (overlap 4/px + 30) avoids it too
    const free = findPath(start, end, [], freeSearch(busy))!;
    expect(free.slice(1, -1).every(p => p.y !== 0)).toBe(true);
  });

  it('a tight step budget gives up (returns null) instead of hanging', () => {
    const walls: Rect[] = Array.from({ length: 30 }, (_, i) => ({ l: i * 30, r: i * 30 + 10, t: i % 2 ? -200 : -180, b: i % 2 ? 180 : 200 }));
    expect(findPath({ x: -20, y: 0 }, { x: 920, y: 0 }, walls, { ...gridSearch(10), maxSteps: 5 })).toBeNull();
    expect(findPath({ x: -20, y: 0 }, { x: 920, y: 0 }, walls, gridSearch(10))).not.toBeNull();
  });

  it('start = end, ends inside a rect', () => {
    expect(findPath({ x: 1, y: 1 }, { x: 1, y: 1 }, [], BASIC_SEARCH)).toEqual([{ x: 1, y: 1 }]);
    expect(findPath({ x: 5, y: 5 }, { x: 50, y: 5 }, [{ l: 0, r: 10, t: 0, b: 10 }], BASIC_SEARCH)).toBeNull();
  });
});
