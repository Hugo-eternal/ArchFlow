// Orthogonal geometry used by routing and hit testing. Pure functions, no DOM, no global
// model (V2: legacy L262–271, which read the global `model`).

export interface Point { x: number; y: number }
/** Axis-aligned rectangle by edges: left, right, top, bottom. */
export interface Rect { l: number; r: number; t: number; b: number; id?: string }
export type Side = 'l' | 'r' | 't' | 'b';

export const EPS = 0.01;

export const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;
export const same = (a: Point, b: Point): boolean => near(a.x, b.x) && near(a.y, b.y);
/** True when a→b is horizontal or vertical. */
export const orth = (a: Point, b: Point): boolean => near(a.x, b.x) || near(a.y, b.y);

/** Unit direction pointing out of a block side. */
export const dir = (s: Side): Point => (s === 'l' ? { x: -1, y: 0 } : s === 'r' ? { x: 1, y: 0 } : s === 't' ? { x: 0, y: -1 } : { x: 0, y: 1 });

/** Rectangle of a box at (x, y) with size w × h, grown by `pad` on every side. */
export const rectOf = (box: { x: number; y: number; w: number; h: number; id?: string }, pad = 0): Rect =>
  ({ id: box.id, l: box.x - pad, r: box.x + box.w + pad, t: box.y - pad, b: box.y + box.h + pad });

/** Strictly inside (points on the border are outside). */
export const inside = (p: Point, r: Rect): boolean => p.x > r.l + EPS && p.x < r.r - EPS && p.y > r.t + EPS && p.y < r.b - EPS;

/** Does segment a→b pass through the interior of r? Non-orthogonal segments always "cut". */
export function cuts(a: Point, b: Point, r: Rect): boolean {
  if (!orth(a, b)) return true;
  if (near(a.y, b.y)) return a.y > r.t + EPS && a.y < r.b - EPS && Math.max(a.x, b.x) > r.l + EPS && Math.min(a.x, b.x) < r.r - EPS;
  return a.x > r.l + EPS && a.x < r.r - EPS && Math.max(a.y, b.y) > r.t + EPS && Math.min(a.y, b.y) < r.b - EPS;
}

/** Orthogonal segment that crosses none of the rectangles. */
export const clear = (a: Point, b: Point, rects: readonly Rect[]): boolean => orth(a, b) && !rects.some(r => cuts(a, b, r));

/**
 * Remove repeated points and collinear middle points that do not reverse direction
 * (a U-turn on one line is kept, as in V2).
 */
export function simplify(ps: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of ps) {
    if (out.length && same(out[out.length - 1], p)) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const a = out[out.length - 3], b = out[out.length - 2], c = out[out.length - 1];
      const vertical = near(a.x, b.x) && near(b.x, c.x) && (b.y - a.y) * (c.y - b.y) >= 0;
      const horizontal = near(a.y, b.y) && near(b.y, c.y) && (b.x - a.x) * (c.x - b.x) >= 0;
      if (vertical || horizontal) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

/** Total Manhattan length of a polyline. */
export const pathLength = (ps: readonly Point[]): number =>
  ps.slice(1).reduce((n, p, i) => n + Math.abs(p.x - ps[i].x) + Math.abs(p.y - ps[i].y), 0);

/** SVG path data "M x,y L x,y …" (V2: path). */
export const toPathData = (ps: readonly Point[]): string => ps.map((p, i) => (i ? 'L' : 'M') + p.x + ',' + p.y).join(' ');
