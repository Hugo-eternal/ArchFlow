// module: core — V3 src/core/geometry.ts and src/core/ids.ts, checked against V2.10.1 behaviour.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import * as g from '../../src/core/geometry';
import { uid, setRandom, isValidId, clone } from '../../src/core/ids';

// deterministic pseudo-random inputs (mulberry32)
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng(42);
const grid = () => Math.round(R() * 20) * 10;                 // on a 10 px grid, so many points coincide
const pt = () => ({ x: grid(), y: grid() });
const orthPt = (a: { x: number; y: number }) => (R() < 0.5 ? { x: a.x, y: grid() } : { x: grid(), y: a.y });
const rect = () => { const l = grid(), t = grid(); return { l, t, r: l + 10 + grid(), b: t + 10 + grid() }; };

const CASES = Array.from({ length: 400 }, () => {
  const a = pt(), b = R() < 0.8 ? orthPt(a) : pt();
  const poly = [a]; for (let i = 0; i < 6; i++) poly.push(R() < 0.25 ? { ...poly[poly.length - 1] } : orthPt(poly[poly.length - 1]));
  return { a, b, r: rect(), rects: [rect(), rect(), rect()], poly };
});

describe('core/geometry matches V2', () => {
  let app: Awaited<ReturnType<typeof openApp>>;
  let v2: { inside: boolean[]; cuts: boolean[]; clear: boolean[]; orth: boolean[]; same: boolean[]; simplify: unknown[] };
  beforeAll(async () => {
    app = await openApp();
    v2 = await app.eval(cases => ({
      inside: cases.map(c => inside(c.a, c.r)),
      cuts: cases.map(c => cuts(c.a, c.b, c.r)),
      clear: cases.map(c => clear(c.a, c.b, c.rects)),
      orth: cases.map(c => orth(c.a, c.b)),
      same: cases.map(c => same(c.a, c.b)),
      simplify: cases.map(c => simplify(c.poly)),
    }), CASES);
  });
  afterAll(async () => { await app?.close(); });

  it('inside / cuts / clear / orth / same agree on 400 random cases', () => {
    expect(CASES.map(c => g.inside(c.a, c.r))).toEqual(v2.inside);
    expect(CASES.map(c => g.cuts(c.a, c.b, c.r))).toEqual(v2.cuts);
    expect(CASES.map(c => g.clear(c.a, c.b, c.rects))).toEqual(v2.clear);
    expect(CASES.map(c => g.orth(c.a, c.b))).toEqual(v2.orth);
    expect(CASES.map(c => g.same(c.a, c.b))).toEqual(v2.same);
  });

  it('the random cases exercise both outcomes', () => {
    for (const k of ['inside', 'cuts', 'clear', 'orth', 'same'] as const) expect(new Set(v2[k]).size, k).toBe(2);
  });

  it('simplify agrees on 400 random polylines', () => {
    expect(CASES.map(c => g.simplify(c.poly))).toEqual(v2.simplify);
  });

  it('dir, rectOf, pathLength, toPathData', async () => {
    expect((['l', 'r', 't', 'b'] as const).map(g.dir)).toEqual(await app.eval(() => ['l', 'r', 't', 'b'].map(dir)));
    expect(g.rectOf({ x: 10, y: 20, w: 100, h: 50, id: 'n' }, 5)).toEqual({ id: 'n', l: 5, r: 115, t: 15, b: 75 });
    const ps = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
    expect(g.pathLength(ps)).toBe(70);
    expect(g.toPathData(ps)).toBe(await app.eval(p => path(p), ps));
  });
});

describe('core/ids', () => {
  it('uid has the V2 format and is unique', () => {
    const ids = Array.from({ length: 2000 }, uid);
    expect(ids.every(id => /^x[a-z0-9]{9}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uid is deterministic with an injected random source, even for short base-36 strings', () => {
    const prev = setRandom(rng(7));
    const a = [uid(), uid()];
    setRandom(rng(7));
    expect([uid(), uid()]).toEqual(a);
    setRandom(() => 0.5); // '0.i' → only one digit per call
    expect(uid()).toMatch(/^x[a-z0-9]{9}$/);
    setRandom(() => 0); // '0' → no digits at all; must still terminate
    expect(uid()).toBe('x000000000');
    setRandom(prev);
  });

  it('isValidId and clone', () => {
    expect(['x1', 'a_b-C', 'x'.repeat(64)].every(isValidId)).toBe(true);
    expect(['', 'bad id', 'x'.repeat(65), 5, null].some(isValidId)).toBe(false);
    const o = { a: [1, { b: 2 }] };
    const c = clone(o);
    expect(c).toEqual(o);
    expect(c.a[1]).not.toBe(o.a[1]);
  });
});
