// layout — re-routing wires for an organize plan (V2 RC2 / RC3, legacy/app.zh-Hant.html):
// ggOn L1476, roAdapters L1594 (lead-out points on the grid in front of a port), roFind L1596
// (A* over the grid lines near blocks and other wires, penalising overlap, crossings and close
// parallels — a different search from router/find-path), uiRoutes L1758 (the layer that runs:
// same-source wires first, longest first, sharing a start with wires already routed — ssCost
// L1753, ssRouteOne L1754). The first layer (uiRoutes L1708 with uiRouteOne / uiRouteCost
// L1705–L1706) is fully replaced in V2 and never runs, so it is not ported.
// Time budgets (V2 performance.now() deadlines) are passed in as `deadline` with a clock, so
// tests can run without a budget and stay deterministic.
import { clear, simplify, type Point } from '../core/geometry';
import { Heap } from '../router/find-path';
import { EPS, copy, endDir, endKey, pairs, rect, sameAt, type EngineEdge, type EngineModel, type Geometry, type Paths } from './model';
import { commonPrefix, cross, overlap, pathOverlap, source, validPath } from './metrics';

export interface Clock { now(): number; deadline: number }
/** No time limit (tests, small diagrams). */
export const NO_LIMIT: Clock = { now: () => 0, deadline: Infinity };

const onGrid = (v: number, g: number) => Number.isFinite(v) && Math.abs(v / g - Math.round(v / g)) < 1e-7;

/** Short paths from an end onto the grid, leaving a port outward (V2 roAdapters): at most 5. */
export function adapters(end: EngineEdge['a'], geo: Geometry, m: EngineModel): Point[][] {
  const a = geo.anchors[endKey(end)], g = geo.grid, d = endDir(end, m), rects = geo.boxes.map(rect), out: Point[][] = [];
  if (!d) {
    if (onGrid(a.x, g) && onGrid(a.y, g)) return [[a]];
    for (const x of [Math.floor(a.x / g) * g, Math.ceil(a.x / g) * g]) for (const y of [Math.floor(a.y / g) * g, Math.ceil(a.y / g) * g]) {
      for (const ps of [[a, { x, y: a.y }, { x, y }], [a, { x: a.x, y }, { x, y }]]) {
        const p = simplify(ps);
        if (pairs(p).every(([u, v]) => clear(u, v, rects))) out.push(p);
      }
    }
    return out;
  }
  const primary = d.x ? 'x' : 'y', secondary = d.x ? 'y' : 'x', sign = d.x || d.y;
  for (const cells of [1, 2, 3]) {
    const v = sign > 0 ? Math.ceil((a[primary] + cells * g) / g) * g : Math.floor((a[primary] - cells * g) / g) * g;
    const lead = { ...a, [primary]: v };
    for (const offset of [0, -g, g]) {
      const end2 = { ...lead, [secondary]: Math.round(a[secondary] / g) * g + offset }, ps = simplify([a, lead, end2]);
      if (pairs(ps).every(([u, w]) => clear(u, w, rects))) out.push(ps);
    }
  }
  return out.slice(0, 5);
}

/** A* between two grid points over candidate lines, avoiding blocks and other wires (V2 roFind). */
export function find(start: Point, end: Point, geo: Geometry, occupied: readonly (readonly Point[])[], gap: number, clock: Clock): Point[] | null {
  if (sameAt(start, end)) return [start];
  const g = geo.grid, rects = geo.boxes.map(rect), xs = [start.x, end.x], ys = [start.y, end.y];
  for (const n of geo.boxes) {
    for (const v of [n.x - gap, n.x, n.x + n.w, n.x + n.w + gap]) xs.push(Math.floor(v / g) * g, Math.ceil(v / g) * g);
    for (const v of [n.y - gap, n.y, n.y + n.h, n.y + n.h + gap]) ys.push(Math.floor(v / g) * g, Math.ceil(v / g) * g);
  }
  for (const ps of occupied) for (const p of ps) { xs.push(Math.floor(p.x / g) * g - gap, Math.ceil(p.x / g) * g + gap); ys.push(Math.floor(p.y / g) * g - gap, Math.ceil(p.y / g) * g + gap); }
  xs.push(Math.min(...xs) - 4 * g, Math.max(...xs) + 4 * g);
  ys.push(Math.min(...ys) - 4 * g, Math.max(...ys) + 4 * g);
  const X = [...new Set(xs)].sort((a, b) => a - b), Y = [...new Set(ys)].sort((a, b) => a - b), W = X.length, H = Y.length;
  if (W * H > 110000) return null;
  const segments = occupied.flatMap(ps => pairs(ps)), heap = new Heap<{ k: number; g: number; f: number }>(), dist = new Map<number, number>(), prev = new Map<number, number>();
  const key = (i: number, j: number, d: number) => (j * W + i) * 3 + d;
  const decode = (k: number) => { const d = k % 3, v = (k - d) / 3; return { i: v % W, j: Math.floor(v / W), d }; };
  const sk = key(X.indexOf(start.x), Y.indexOf(start.y), 2);
  dist.set(sk, 0);
  heap.push({ k: sk, g: 0, f: 0 });
  let goal: number | null = null, steps = 0;
  while (heap.length && steps++ < 80000) {
    if (steps % 128 === 0 && clock.now() > clock.deadline) return null;
    const u = heap.pop();
    if (u.g !== dist.get(u.k)) continue;
    const { i, j, d } = decode(u.k), a = { x: X[i], y: Y[j] };
    if (sameAt(a, end)) { goal = u.k; break; }
    for (const [di, dj, nd] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= W || nj < 0 || nj >= H) continue;
      const b = { x: X[ni], y: Y[nj] };
      if (!clear(a, b, rects)) continue;
      let penalty = 0;
      for (const [c, dd] of segments) {
        const o = overlap(a, b, c, dd);
        if (o) penalty += o * 16 + g * 8;
        if (cross(a, b, c, dd)) penalty += g * 60;
        const horizontal = a.y === b.y;
        if (horizontal && c.y === dd.y && Math.abs(a.y - c.y) > EPS && Math.abs(a.y - c.y) < gap && Math.min(Math.max(a.x, b.x), Math.max(c.x, dd.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, dd.x))) penalty += g * 2;
        if (!horizontal && c.x === dd.x && Math.abs(a.x - c.x) > EPS && Math.abs(a.x - c.x) < gap && Math.min(Math.max(a.y, b.y), Math.max(c.y, dd.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, dd.y))) penalty += g * 2;
      }
      const cost = u.g + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (d !== 2 && d !== nd ? g * 3 : 0) + penalty, k = key(ni, nj, nd);
      if (cost < (dist.get(k) ?? Infinity)) { dist.set(k, cost); prev.set(k, u.k); heap.push({ k, g: cost, f: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) }); }
    }
  }
  if (goal === null) return null;
  const out: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = prev.get(k)) { const { i, j } = decode(k); out.push({ x: X[i], y: Y[j] }); }
  return simplify(out.reverse());
}

/** The shapes tried between two lead-out ends: L-shapes and Z-shapes at 1/4, 1/2, 3/4. */
function shapes(s: Point, t: Point, g: number): Point[][] {
  const out = [[s, { x: t.x, y: s.y }, t], [s, { x: s.x, y: t.y }, t]];
  for (const f of [0.25, 0.5, 0.75]) {
    const x = Math.round((s.x + (t.x - s.x) * f) / g) * g, y = Math.round((s.y + (t.y - s.y) * f) / g) * g;
    out.push([s, { x, y: s.y }, { x, y: t.y }, t], [s, { x: s.x, y }, { x: t.x, y }, t]);
  }
  return out;
}

interface Placed { e: EngineEdge; ps: Point[] }

/** Cost of a path that may share a start with wires from the same source (V2 ssCost). */
export function sharedCost(ps: readonly Point[], e: EngineEdge, occupied: readonly Placed[], g: number): number {
  let length = 0, crossings = 0, bad = 0, rejoined = 0, shared = 0;
  for (const [a, b] of pairs(ps)) length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  for (const entry of occupied) {
    const other = entry.ps, over = pathOverlap(ps, other), sameSource = !!source(e) && source(e) === source(entry.e);
    const prefix = sameSource ? Math.min(over, commonPrefix(ps, other)) : 0;
    if (sameSource) { shared += prefix; rejoined += Math.max(0, over - prefix); } else bad += over;
    for (const [a, b] of pairs(ps)) for (const [c, d] of pairs(other)) if (cross(a, b, c, d)) crossings++;
  }
  return crossings * g * 100 + bad * 14 + rejoined * 12 + Math.max(0, ps.length - 2) * g * 4 + length - shared * 0.25;
}

/** One wire, also trying to leave along a wire from the same source (V2 ssRouteOne). */
export function routeShared(e: EngineEdge, m: EngineModel, geo: Geometry, occupied: readonly Placed[], clock: Clock): Point[] | null {
  const a = geo.anchors[endKey(e.a)], b = geo.anchors[endKey(e.b)], g = geo.grid;
  const lefts = adapters(e.a, geo, m).slice(0, 3), rights = adapters(e.b, geo, m).slice(0, 3), candidates: Point[][] = [], seen = new Set<string>();
  const add = (raw: Point[]) => { const ps = simplify(raw), k = JSON.stringify(ps); if (!seen.has(k) && validPath(ps, e, geo, m)) { seen.add(k); candidates.push(ps); } };
  add([a, b]);
  for (const entry of occupied) {
    if (!source(e) || source(e) !== source(entry.e)) continue;
    const ps = entry.ps;
    for (let i = 1; i < ps.length; i++) {
      const p = ps[i - 1], q = ps[i], prefix = ps.slice(0, i);
      for (const r of rights) {
        const t = r[r.length - 1], joins = [q];
        if (p.y === q.y && t.x >= Math.min(p.x, q.x) && t.x <= Math.max(p.x, q.x)) joins.push({ x: t.x, y: p.y });
        if (p.x === q.x && t.y >= Math.min(p.y, q.y) && t.y <= Math.max(p.y, q.y)) joins.push({ x: p.x, y: t.y });
        for (const join of joins) { const left = simplify([...prefix, join]); if (left.length > 1 && lefts.length < 35) lefts.push(left); }
      }
    }
  }
  for (const left of lefts) for (const right of rights) {
    const s = left[left.length - 1], t = right[right.length - 1];
    for (const mid of shapes(s, t, g)) add([...left, ...mid, ...[...right].reverse()]);
  }
  if (!candidates.length && lefts.length && rights.length && clock.now() < clock.deadline) {
    const mid = find(lefts[0][lefts[0].length - 1], rights[0][rights[0].length - 1], geo, occupied.filter(x => source(x.e) !== source(e)).map(x => x.ps), 2 * g, clock);
    if (mid) add([...lefts[0], ...mid, ...[...rights[0]].reverse()]);
  }
  candidates.sort((p, q) => sharedCost(p, e, occupied, g) - sharedCost(q, e, occupied, g));
  return candidates[0] ?? null;
}

export interface Permissions { routes: boolean; blocks: boolean; ports: boolean; sides: boolean; labels: boolean; scope: 'all' | 'selected'; space: 'wide' | string; ids: readonly string[] }

/**
 * Re-route every wire the permissions allow (unlocked; all, or the selected ones) around the
 * fixed ones: same source together, longest first (V2 uiRoutes, second layer L1758).
 */
export function routes(m: EngineModel, geo: Geometry, before: Paths, permissions: Permissions, clock: Clock = NO_LIMIT): Paths {
  const paths = copy(before);
  const eligible = (e: EngineEdge) => permissions.routes && !e.locked && (permissions.scope === 'all' || permissions.ids.includes(e.id));
  const work = m.edges.filter(eligible), fixed = m.edges.filter(e => !eligible(e));
  const occupied: Placed[] = fixed.map(e => ({ e, ps: paths[e.id] }));
  const span = (e: EngineEdge) => { const p = geo.anchors[endKey(e.a)], q = geo.anchors[endKey(e.b)]; return Math.abs(p.x - q.x) + Math.abs(p.y - q.y); };
  const order = [...work].sort((a, b) => String(source(a)).localeCompare(String(source(b))) || span(b) - span(a) || a.id.localeCompare(b.id));
  for (const e of order) {
    const ps = routeShared(e, m, geo, occupied, clock);
    if (ps) paths[e.id] = ps;
    occupied.push({ e, ps: paths[e.id] });
  }
  return paths;
}

