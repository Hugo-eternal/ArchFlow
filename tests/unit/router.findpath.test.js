// module: router — findPath (V2.10.1 L274): orthogonal A* around block rectangles.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';

// Independent checks (do not reuse the engine's own clear()/cuts()).
const isOrthogonal = ps => ps.slice(1).every((p, i) => p.x === ps[i].x || p.y === ps[i].y);
const segCutsRect = (a, b, r) => {
  const eps = 0.01;
  if (a.y === b.y) return a.y > r.t + eps && a.y < r.b - eps && Math.max(a.x, b.x) > r.l + eps && Math.min(a.x, b.x) < r.r - eps;
  return a.x > r.l + eps && a.x < r.r - eps && Math.max(a.y, b.y) > r.t + eps && Math.min(a.y, b.y) < r.b - eps;
};
const avoids = (ps, rects) => ps.slice(1).every((p, i) => rects.every(r => !segCutsRect(ps[i], p, r)));
const length = ps => ps.slice(1).reduce((n, p, i) => n + Math.abs(p.x - ps[i].x) + Math.abs(p.y - ps[i].y), 0);
const bends = ps => Math.max(0, ps.length - 2);

describe('findPath', () => {
  let app;
  const fp = (s, e, rects) => app.eval((s, e, r) => findPath(s, e, r), s, e, rects);
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  it('returns the start point when start equals end', async () => {
    expect(await fp({ x: 5, y: 5 }, { x: 5, y: 5 }, [])).toEqual([{ x: 5, y: 5 }]);
  });

  it('a straight line needs no bends', async () => {
    const ps = await fp({ x: 0, y: 0 }, { x: 200, y: 0 }, []);
    expect(ps).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  });

  it('an L-shaped route has one bend and Manhattan length', async () => {
    const ps = await fp({ x: 0, y: 0 }, { x: 100, y: 50 }, []);
    expect(isOrthogonal(ps)).toBe(true);
    expect(bends(ps)).toBe(1);
    expect(length(ps)).toBe(150);
  });

  it('goes around a block in the way, orthogonally, without crossing it', async () => {
    const block = { l: 80, r: 120, t: -40, b: 40 };
    const ps = await fp({ x: 0, y: 0 }, { x: 200, y: 0 }, [block]);
    expect(ps).not.toBeNull();
    expect(isOrthogonal(ps)).toBe(true);
    expect(avoids(ps, [block])).toBe(true);
    expect(ps[0]).toEqual({ x: 0, y: 0 });
    expect(ps.at(-1)).toEqual({ x: 200, y: 0 });
  });

  it('avoids several blocks', async () => {
    const rects = [
      { l: 60, r: 100, t: -60, b: 30 },
      { l: 140, r: 180, t: -30, b: 60 },
      { l: 220, r: 260, t: -60, b: 30 },
    ];
    const ps = await fp({ x: 0, y: 0 }, { x: 320, y: 0 }, rects);
    expect(ps).not.toBeNull();
    expect(isOrthogonal(ps)).toBe(true);
    expect(avoids(ps, rects)).toBe(true);
  });

  it('returns null when an endpoint is inside a block', async () => {
    expect(await fp({ x: 100, y: 0 }, { x: 300, y: 0 }, [{ l: 80, r: 120, t: -40, b: 40 }])).toBeNull();
    expect(await fp({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ l: 80, r: 120, t: -40, b: 40 }])).toBeNull();
  });

  it('returns null when the target is fully enclosed', async () => {
    // four walls around (200,0) leave no gap
    const walls = [
      { l: 150, r: 250, t: -60, b: -40 }, { l: 150, r: 250, t: 40, b: 60 },
      { l: 150, r: 170, t: -60, b: 60 }, { l: 230, r: 250, t: -60, b: 60 },
    ];
    expect(await fp({ x: 0, y: 0 }, { x: 200, y: 0 }, walls)).toBeNull();
  });

  it('is deterministic', async () => {
    const rects = [{ l: 80, r: 120, t: -40, b: 40 }];
    const a = await fp({ x: 0, y: 0 }, { x: 200, y: 10 }, rects);
    const b = await fp({ x: 0, y: 0 }, { x: 200, y: 10 }, rects);
    expect(a).toEqual(b);
  });
});

describe('routed wires in the function example', () => {
  let app;
  beforeAll(async () => { app = await openApp(); await app.createProject('function'); });
  afterAll(async () => { await app?.close(); });

  it('every wire is orthogonal and avoids every block except its own endpoints', async () => {
    const res = await app.eval(() => {
      drawEdges();
      const out = [];
      for (const e of model.edges) {
        const r = routes.get(e.id);
        if (!r) { out.push({ id: e.id, missing: true }); continue; }
        // blocks this wire connects to may be touched at the endpoints
        const own = new Set([e.a.node, e.b.node].filter(Boolean));
        const rects = model.nodes.filter(n => !own.has(n.id)).map(n => { const s = size(n); return { l: n.x, r: n.x + s.w, t: n.y, b: n.y + s.h }; });
        out.push({ id: e.id, ps: r.ps.map(p => ({ x: p.x, y: p.y })), rects });
      }
      return out;
    });
    expect(res.length).toBeGreaterThan(0);
    for (const w of res) {
      expect(w.missing, w.id).toBeUndefined();
      expect(isOrthogonal(w.ps), w.id).toBe(true);
      expect(avoids(w.ps, w.rects), w.id).toBe(true);
    }
  });

  it('wires of different nets never run on top of each other', async () => {
    const segs = await app.eval(() => {
      drawEdges();
      return model.edges.map(e => ({ id: e.id, net: JSON.stringify([e.a, e.b]), ps: (routes.get(e.id)?.ps || []).map(p => ({ x: p.x, y: p.y })) }));
    });
    const overlap = (a, b, c, d) => {
      if (a.y === b.y && c.y === d.y && a.y === c.y) return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > 0.5;
      if (a.x === b.x && c.x === d.x && a.x === c.x) return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > 0.5;
      return false;
    };
    // wires meeting at a junction belong to the same net and may share a trunk
    const shares = (w1, w2) => {
      const ends = w => [JSON.stringify(JSON.parse(w.net)[0]), JSON.stringify(JSON.parse(w.net)[1])];
      return ends(w1).some(x => ends(w2).includes(x));
    };
    const bad = [];
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (shares(segs[i], segs[j])) continue;
      const A = segs[i].ps, B = segs[j].ps;
      for (let a = 1; a < A.length; a++) for (let b = 1; b < B.length; b++)
        if (overlap(A[a - 1], A[a], B[b - 1], B[b])) bad.push(`${segs[i].id}×${segs[j].id}`);
    }
    expect(bad).toEqual([]);
  });
});
