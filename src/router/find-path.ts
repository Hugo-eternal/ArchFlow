// Orthogonal path search: A* over a visibility grid built from the obstacle edges, with a
// penalty per bend and an optional per-segment cost (overlaps / crossings with wires already
// placed). One engine; the three V2 variants are presets:
//
//   GRID  — grid snapping on (V2 ggFind L1518): margin 5 g, bend 2 g, overlap 3/px + 2 g.
//   FREE  — grid off (V2 afFindRoute + afRouteCost L1208–1209): margin 45, bend 38, overlap
//           4/px + 30, crossing 60; junction coordinates are added to the search lines.
//   BASIC — the original search (V2 findPath L274): margin 40, bend 24, no segment cost.
//           Superseded in V2 by FREE for wires, kept for the wire-drawing preview.
//
// Pure: no model, no DOM. Rects are already padded by the caller (router/full-path, 3.16).
import { clear, inside, near, same, simplify, type Point, type Rect } from '../core/geometry';

/** Binary min-heap on `f` (port of V2 Heap L272 — same tie order, so results match V2). */
class Heap<T extends { f: number }> {
  private a: T[] = [];
  get length() { return this.a.length; }
  push(v: T): void {
    let i = this.a.length;
    this.a.push(v);
    while (i) { const p = (i - 1) >> 1; if (this.a[p].f <= v.f) break; this.a[i] = this.a[p]; i = p; }
    this.a[i] = v;
  }
  pop(): T {
    const root = this.a[0], last = this.a.pop()!;
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1].f < this.a[c].f) c++;
        if (this.a[c].f >= last.f) break;
        this.a[i] = this.a[c]; i = c;
      }
      this.a[i] = last;
    }
    return root;
  }
}

export type Segment = readonly [Point, Point];

export interface SearchOptions {
  /** Extra search lines this far outside everything (lets routes go around the outside). */
  margin: number;
  /** Cost added at each change of direction. */
  bend: number;
  /** Give up after this many expansions (the route then counts as failed). */
  maxSteps: number;
  /** Cost of moving a → b on top of its length (overlaps / crossings). */
  segmentCost?: (a: Point, b: Point) => number;
  /** Additional x / y search lines (e.g. junction positions). */
  xs?: readonly number[];
  ys?: readonly number[];
  /** Initial heuristic of the start node (V2 BASIC used the distance, the others 0). */
  startHeuristic?: boolean;
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]] as const;   // d: 0 horizontal, 1 vertical, 2 none

/**
 * Cheapest orthogonal polyline from `start` to `end` that does not cut any rect, simplified;
 * `[start]` when they coincide; null when an end is inside a rect or no route exists.
 */
export function findPath(start: Point, end: Point, rects: readonly Rect[], o: SearchOptions): Point[] | null {
  if (same(start, end)) return [{ ...start }];
  if (rects.some(r => inside(start, r) || inside(end, r))) return null;
  const xs = [start.x, end.x], ys = [start.y, end.y];
  for (const r of rects) { xs.push(r.l, r.r); ys.push(r.t, r.b); }
  if (o.xs) xs.push(...o.xs);
  if (o.ys) ys.push(...o.ys);
  xs.push(Math.min(...xs) - o.margin, Math.max(...xs) + o.margin);
  ys.push(Math.min(...ys) - o.margin, Math.max(...ys) + o.margin);
  const X = [...new Set(xs)].sort((a, b) => a - b), Y = [...new Set(ys)].sort((a, b) => a - b), W = X.length, H = Y.length;
  const key = (i: number, j: number, d: number) => (j * W + i) * 3 + d;
  const decode = (k: number) => { const d = k % 3, v = (k - d) / 3; return { i: v % W, j: Math.floor(v / W), d }; };

  const heap = new Heap<{ k: number; g: number; f: number }>(), dist = new Map<number, number>(), prev = new Map<number, number>();
  const sk = key(X.indexOf(start.x), Y.indexOf(start.y), 2);
  dist.set(sk, 0);
  heap.push({ k: sk, g: 0, f: o.startHeuristic ? Math.abs(start.x - end.x) + Math.abs(start.y - end.y) : 0 });
  let goal: number | null = null, steps = 0;
  while (heap.length && steps++ < o.maxSteps) {
    const cur = heap.pop();
    if (cur.g !== dist.get(cur.k)) continue;
    const { i, j, d } = decode(cur.k), a = { x: X[i], y: Y[j] };
    if (same(a, end)) { goal = cur.k; break; }
    for (const [di, dj, nd] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= W || nj < 0 || nj >= H) continue;
      const b = { x: X[ni], y: Y[nj] };
      if (!clear(a, b, rects)) continue;
      const g = cur.g + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (d !== 2 && d !== nd ? o.bend : 0) + (o.segmentCost ? o.segmentCost(a, b) : 0);
      const k = key(ni, nj, nd);
      if (g < (dist.get(k) ?? Infinity)) {
        dist.set(k, g); prev.set(k, cur.k);
        heap.push({ k, g, f: g + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
      }
    }
  }
  if (goal === null) return null;
  const ps: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = prev.get(k)) { const v = decode(k); ps.push({ x: X[v.i], y: Y[v.j] }); }
  return simplify(ps.reverse());
}

// ------------------------------------------------------------------ segment costs

/** Grid mode (V2 ggFind): exact collinear overlap costs 3 per px + 2 g. Crossings are free. */
export function gridOverlapCost(segments: readonly Segment[], g: number) {
  return (a: Point, b: Point): number => {
    let penalty = 0;
    for (const [c, d] of segments) {
      if ((a.y === b.y && c.y === d.y && a.y === c.y) || (a.x === b.x && c.x === d.x && a.x === c.x)) {
        const h = a.y === b.y;
        const overlap = Math.min(Math.max(h ? a.x : a.y, h ? b.x : b.y), Math.max(h ? c.x : c.y, h ? d.x : d.y))
          - Math.max(Math.min(h ? a.x : a.y, h ? b.x : b.y), Math.min(h ? c.x : c.y, h ? d.x : d.y));
        if (overlap > 0) penalty += overlap * 3 + g * 2;
      }
    }
    return penalty;
  };
}

/** Free mode (V2 afRouteCost): overlap > 1 px costs 4 per px + 30; a proper crossing costs 60. */
export function freeRouteCost(segments: readonly Segment[]) {
  return (a: Point, b: Point): number => {
    let cost = 0;
    for (const [c, d] of segments) {
      const h = near(a.y, b.y), v = near(c.y, d.y);
      if (h === v) {
        if (h && near(a.y, c.y)) {
          const overlap = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
          if (overlap > 1) cost += overlap * 4 + 30;
        } else if (!h && near(a.x, c.x)) {
          const overlap = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
          if (overlap > 1) cost += overlap * 4 + 30;
        }
      } else {
        const x = h ? c.x : a.x, y = h ? a.y : c.y;
        if ((x > Math.min(a.x, b.x) + 0.1 && x < Math.max(a.x, b.x) - 0.1 && y > Math.min(c.y, d.y) + 0.1 && y < Math.max(c.y, d.y) - 0.1)
          || (x > Math.min(c.x, d.x) + 0.1 && x < Math.max(c.x, d.x) - 0.1 && y > Math.min(a.y, b.y) + 0.1 && y < Math.max(a.y, b.y) - 0.1)) cost += 60;
      }
    }
    return cost;
  };
}

// ------------------------------------------------------------------ presets

export const gridSearch = (g: number, segments: readonly Segment[] = []): SearchOptions =>
  ({ margin: 5 * g, bend: 2 * g, maxSteps: 120_000, segmentCost: gridOverlapCost(segments, g) });

export const freeSearch = (segments: readonly Segment[] = [], junctions: readonly Point[] = []): SearchOptions =>
  ({ margin: 45, bend: 38, maxSteps: 120_000, segmentCost: freeRouteCost(segments), xs: junctions.map(j => j.x), ys: junctions.map(j => j.y) });

export const BASIC_SEARCH: Readonly<SearchOptions> = Object.freeze({ margin: 40, bend: 24, maxSteps: 150_000, startHeuristic: true });

/** Obstacle rectangles of blocks snapped outward to the grid (V2 ggBoxes). */
export function gridBoxes(blocks: readonly { id: string; x: number; y: number; w: number; h: number }[], g: number, pad = 0): Rect[] {
  return blocks.map(n => ({
    id: n.id,
    l: Math.floor((n.x - pad) / g) * g, r: Math.ceil((n.x + n.w + pad) / g) * g,
    t: Math.floor((n.y - pad) / g) * g, b: Math.ceil((n.y + n.h + pad) / g) * g,
  }));
}
