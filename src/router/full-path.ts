// The complete route of a wire: end points, short stubs out of the ports, the searched (or
// manual) middle, and whether the result is legal. Two modes, as in V2:
//
//   grid on  — V2 ggRoute L1523 + ggPathLegal L1517: every point on the grid, stubs one cell
//              long, leaving each port straight out of its side.
//   grid off — V2 fullPath L1211 (search with 16 px clearance, then 6 px) and, for manual
//              routes, the original fullPath L277 (bridge to the waypoints, stubs 30 px).
//
// `wire.route` holds what V2 kept in two fields: `manual` (waypoints between the stubs) and
// `afRouteOnly.points` (the whole polyline, ends included). A route whose first point is the
// wire's start is taken as a whole polyline; otherwise as waypoints.
//
// Pure: takes the diagram, returns points. Results are not cached here (render caches per frame).
import { clear, dir, orth, same, simplify, rectOf, type Point, type Rect } from '../core/geometry';
import { endPoint, gridSize, isOnGrid } from '../core/grid';
import type { BlockDiagram, Wire, WireEnd } from '../io/schema-types';
import { findPath, freeSearch, gridBoxes, gridSearch, type Segment } from './find-path';

export interface Route {
  /** The polyline from end a to end b (simplified, at least two points). */
  ps: Point[];
  /** Fits the rules: orthogonal, clear of blocks (and, with the grid, on it and leaving ports straight). */
  valid: boolean;
  /** The search found nothing; `ps` is a placeholder L shape. */
  failed: boolean;
}

/** Stub length out of a port when the grid is off (V2 stub L266). */
export const FREE_STUB = 30;

const portSide = (d: BlockDiagram, e: WireEnd) => {
  if ('junction' in e) return null;
  return d.blocks.find(b => b.id === e.block)?.ports.find(p => p.id === e.port)?.side ?? null;
};

/** Point just outside the port (or the junction itself). */
function stubOf(d: BlockDiagram, e: WireEnd, at: Point, length: number): Point {
  const side = portSide(d, e);
  if (!side) return at;
  const v = dir(side);
  return { x: at.x + v.x * length, y: at.y + v.y * length };
}

/** Block rectangles grown by `pad` (V2 boxes). */
export const blockRects = (d: BlockDiagram, pad = 0): Rect[] => d.blocks.map(b => rectOf(b, pad));

/** Two-point or L-shaped connection between a and b, preferring one that stays clear (V2 bridge). */
function bridge(a: Point, b: Point, rects: Rect[]): Point[] {
  if (orth(a, b)) return [a, b];
  const options = [[a, { x: b.x, y: a.y }, b], [a, { x: a.x, y: b.y }, b]];
  return options.find(ps => ps.slice(1).every((p, i) => clear(ps[i], p, rects))) ?? options[0];
}

const legalFree = (ps: Point[], d: BlockDiagram) => {
  const rs = blockRects(d, 0);
  return ps.length >= 2 && ps.slice(1).every((p, i) => clear(ps[i], p, rs));
};

/**
 * Grid legality (V2 ggPathLegal): ends at the two anchors, every point on the grid, no
 * zero-length or block-cutting segment, and the first / last segment leaves the port outwards.
 */
export function legalOnGrid(ps: Point[], w: Pick<Wire, 'a' | 'b'>, d: BlockDiagram): boolean {
  const g = gridSize(d.grid);
  if (ps.length < 2 || !same(ps[0], endPoint(w.a, d, g)) || !same(ps.at(-1)!, endPoint(w.b, d, g))) return false;
  const rs = gridBoxes(d.blocks, g);
  for (let i = 0; i < ps.length; i++) {
    if (!isOnGrid(ps[i].x, g) || !isOnGrid(ps[i].y, g)) return false;
    if (i && (same(ps[i - 1], ps[i]) || !clear(ps[i - 1], ps[i], rs))) return false;
  }
  for (const [end, idx] of [['a', 1], ['b', ps.length - 2]] as const) {
    const side = portSide(d, w[end]);
    if (!side) continue;
    const a = endPoint(w[end], d, g), v = dir(side), b = ps[idx];
    if ((v.x && (b.y !== a.y || (b.x - a.x) * v.x <= 0)) || (v.y && (b.x !== a.x || (b.y - a.y) * v.y <= 0))) return false;
  }
  return true;
}

/** Is `route` a whole polyline (starts at end a) rather than waypoints? */
const isWhole = (route: Point[], a: Point) => route.length > 0 && same(route[0], a);

function gridRoute(w: Wire, d: BlockDiagram, segments: readonly Segment[]): Route {
  const g = gridSize(d.grid), a = endPoint(w.a, d, g), b = endPoint(w.b, d, g);
  if (w.locked || w.route?.length) {
    const ps = simplify([a, ...(w.route ?? []), b]);
    if (legalOnGrid(ps, w, d)) return { ps, valid: true, failed: false };
    if (w.locked) return { ps: [a, b], valid: false, failed: true };
  }
  if (orth(a, b) && legalOnGrid([a, b], w, d)) return { ps: [a, b], valid: true, failed: false };
  const sa = stubOf(d, w.a, a, g), sb = stubOf(d, w.b, b, g);
  const middle = findPath(sa, sb, gridBoxes(d.blocks, g, g), gridSearch(g, segments))
    ?? findPath(sa, sb, gridBoxes(d.blocks, g, 0), gridSearch(g, segments));
  if (middle) {
    const ps = simplify([a, sa, ...middle, sb, b]);
    if (legalOnGrid(ps, w, d)) return { ps, valid: true, failed: false };
  }
  return { ps: simplify([a, { x: b.x, y: a.y }, b]), valid: false, failed: true };
}

function freeRoute(w: Wire, d: BlockDiagram, segments: readonly Segment[]): Route {
  const a = endPoint(w.a, d), b = endPoint(w.b, d);
  const route = w.route ?? [];
  const sa = 'junction' in w.a ? a : stubOf(d, w.a, a, FREE_STUB), sb = 'junction' in w.b ? b : stubOf(d, w.b, b, FREE_STUB);
  if (route.length) {
    let ps: Point[];
    if (isWhole(route, a)) {
      // a whole polyline (V2 afRouteOnly), used as stored
      ps = simplify([...route, b]);
    } else {
      // waypoints (V2 manual, fullPath L277): bridged to the stubs; a junction end has no stub
      const rs = blockRects(d, 0);
      const middle = [...bridge(sa, route[0], rs), ...route.slice(1), ...bridge(route.at(-1)!, sb, rs).slice(1)];
      ps = simplify([a, sa, ...simplify(middle).slice(1, -1), sb, b]);
    }
    const valid = legalFree(ps, d);
    // V3 rule, both modes: a stored route that no longer fits is replaced by a search unless
    // the wire is locked (V2 did this with the grid on and for afRouteOnly; CHANGELOG)
    if (valid || w.locked) return { ps, valid, failed: false };
  }
  const search = freeSearch(segments, d.junctions);
  const middle = findPath(sa, sb, blockRects(d, 16), search) ?? findPath(sa, sb, blockRects(d, 6), search);
  const failed = !middle;
  const ps = simplify([a, sa, ...(middle ?? bridge(sa, sb, blockRects(d, 0))), sb, b]);
  return { ps, valid: !failed && legalFree(ps, d), failed };
}

/** Route one wire. `segments` are the wires already placed (for the overlap cost). */
export function routeWire(w: Wire, d: BlockDiagram, segments: readonly Segment[] = []): Route {
  return d.grid?.snap ? gridRoute(w, d, segments) : freeRoute(w, d, segments);
}

/** Segments of a polyline, for the overlap cost of later wires. */
export const segmentsOf = (ps: readonly Point[]): Segment[] => ps.slice(1).map((p, i) => [ps[i], p] as Segment);

/**
 * Route every wire in drawing order (V2 drawEdges: model order, each finished wire adding its
 * segments to the cost of the next). Returns routes by wire id.
 */
export function routeAll(d: BlockDiagram): Map<string, Route> {
  const out = new Map<string, Route>(), segments: Segment[] = [];
  for (const w of d.wires) {
    const r = routeWire(w, d, segments);
    out.set(w.id, r);
    segments.push(...segmentsOf(r.ps));
  }
  return out;
}
