// layout — measuring a plan: invalid wires, crossings, overlaps, bends, length (RC2), shared /
// unrelated / re-joined runs of wires from the same source (RC3), label conflicts, and the RC4
// score and acceptance rule. Ported from V2 (legacy/app.zh-Hant.html): roValid L1584,
// roOverlap L1585, roCross L1586, roMetrics L1587, ssSource / ssCommonPrefix / ssOverlap /
// ssClassify L1749–L1752, uiLabelRect L1709 + L1813, uiRectOverlap L1710, uiLabelConflicts L1715,
// uiNoOverlap L1693, v4Measure / v4Score / v4Allowed / v4HasChanges L1819–L1822.
import { clear, simplify, type Point } from '../core/geometry';
import { EPS, endDir, endKey, pairs, rect, sameAt, type EngineEdge, type EngineModel, type Geometry, type Paths } from './model';

/** Is a path legal: starts / ends on its anchors, orthogonal, clear of every block, leaves ports outward (V2 roValid). */
export function validPath(ps: readonly Point[] | undefined, e: EngineEdge, geo: Geometry, m: EngineModel): boolean {
  if (!Array.isArray(ps) || ps.length < 2 || ps.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const a = geo.anchors[endKey(e.a)], b = geo.anchors[endKey(e.b)];
  if (!a || !b || !sameAt(ps[0], a) || !sameAt(ps[ps.length - 1], b)) return false;
  const rects = geo.boxes.map(rect);
  for (const [x, y] of pairs(ps)) if (sameAt(x, y) || !clear(x, y, rects)) return false;
  for (const [end, i] of [['a', 1], ['b', ps.length - 2]] as const) {
    const d = endDir(e[end], m);
    if (!d) continue;
    const at = end === 'a' ? ps[0] : ps[ps.length - 1], p = ps[i];
    if ((d.x && (Math.abs(p.y - at.y) > EPS || (p.x - at.x) * d.x <= 0)) || (d.y && (Math.abs(p.x - at.x) > EPS || (p.y - at.y) * d.y <= 0))) return false;
  }
  return true;
}

/** Length two collinear segments share (V2 roOverlap). */
export function overlap(a: Point, b: Point, c: Point, d: Point): number {
  const horizontal = Math.abs(a.y - b.y) < EPS, other = Math.abs(c.y - d.y) < EPS;
  if (horizontal !== other) return 0;
  if (horizontal ? Math.abs(a.y - c.y) > EPS : Math.abs(a.x - c.x) > EPS) return 0;
  const k = horizontal ? 'x' : 'y';
  return Math.max(0, Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) - Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])));
}

/** Where a horizontal and a vertical segment cross strictly inside both (V2 roCross). */
export function cross(a: Point, b: Point, c: Point, d: Point): Point | null {
  if (Math.abs(a.y - b.y) < EPS && Math.abs(c.x - d.x) < EPS) {
    const x = c.x, y = a.y;
    if (x > Math.min(a.x, b.x) + EPS && x < Math.max(a.x, b.x) - EPS && y > Math.min(c.y, d.y) + EPS && y < Math.max(c.y, d.y) - EPS) return { x, y };
  }
  if (Math.abs(a.x - b.x) < EPS && Math.abs(c.y - d.y) < EPS) return cross(c, d, a, b);
  return null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface PathMetrics { invalid: number; crossings: number; overlap: number; bends: number; length: number }

/** V2 roMetrics. */
export function pathMetrics(paths: Paths, m: EngineModel, geo: Geometry): PathMetrics {
  let invalid = 0, bends = 0, length = 0, crossings = 0, over = 0;
  const entries = m.edges.map(e => ({ e, ps: simplify(paths[e.id] ?? []) }));
  for (const { e, ps } of entries) {
    if (!validPath(ps, e, geo, m)) invalid++;
    bends += Math.max(0, ps.length - 2);
    for (const [a, b] of pairs(ps)) length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const hits = new Set<string>();
    for (const [a, b] of pairs(entries[i].ps)) for (const [c, d] of pairs(entries[j].ps)) {
      over += overlap(a, b, c, d);
      const p = cross(a, b, c, d);
      if (p) hits.add(`${p.x.toFixed(5)},${p.y.toFixed(5)}`);
    }
    crossings += hits.size;
  }
  return { invalid, crossings, overlap: r2(over), bends, length: r2(length) };
}

/** Source of an edge: its start port or junction (V2 ssSource). */
export const source = (e: EngineEdge): string | null => ('junction' in e.a ? `junction:${e.a.junction}` : `port:${JSON.stringify([e.a.node, e.a.port])}`);

/** Length two paths from the same start run together before parting (V2 ssCommonPrefix). */
export function commonPrefix(first: readonly Point[], second: readonly Point[]): number {
  const a = simplify(first), b = simplify(second);
  if (!a.length || !b.length || !sameAt(a[0], b[0])) return 0;
  let i = 1, j = 1, p = { ...a[0] }, length = 0;
  while (i < a.length && j < b.length) {
    const x = a[i], y = b[j];
    const dx = Math.sign(x.x - p.x), dy = Math.sign(x.y - p.y), ex = Math.sign(y.x - p.x), ey = Math.sign(y.y - p.y);
    if (dx !== ex || dy !== ey || (dx && dy) || (ex && ey)) break;
    const d = Math.min(Math.abs(x.x - p.x) + Math.abs(x.y - p.y), Math.abs(y.x - p.x) + Math.abs(y.y - p.y));
    if (d < 1e-6) break;
    length += d;
    p = { x: p.x + dx * d, y: p.y + dy * d };
    if (sameAt(p, x)) i++;
    if (sameAt(p, y)) j++;
  }
  return length;
}

/** Total collinear overlap of two paths (V2 ssOverlap). */
export const pathOverlap = (first: readonly Point[], second: readonly Point[]) =>
  pairs(first).reduce((s, [a, b]) => s + pairs(second).reduce((t, [c, d]) => t + overlap(a, b, c, d), 0), 0);

/** Shared runs from the same source, unrelated overlaps, and same-source re-joins (V2 ssClassify). */
export function classify(paths: Paths, m: EngineModel): { shared: number; unrelated: number; rejoined: number } {
  let shared = 0, unrelated = 0, rejoined = 0;
  for (let i = 0; i < m.edges.length; i++) for (let j = i + 1; j < m.edges.length; j++) {
    const e = m.edges[i], f = m.edges[j], a = paths[e.id] ?? [], b = paths[f.id] ?? [];
    const over = pathOverlap(a, b), sameSource = !!source(e) && source(e) === source(f);
    const prefix = sameSource ? Math.min(over, commonPrefix(a, b)) : 0;
    shared += prefix;
    if (sameSource) rejoined += Math.max(0, over - prefix); else unrelated += over;
  }
  return { shared: r2(shared), unrelated: r2(unrelated), rejoined: r2(rejoined) };
}

/** A wire label as the engine places it: centre x, baseline y, size, optional rotation (degrees). */
export interface EngineLabel { x: number; y: number; w: number; h: number; angle?: number; text?: string; size?: number }

/** Bounding box of a label, rotated when it has an angle (V2 uiLabelRect L1709 + L1813). */
export function labelRect(l: EngineLabel): { x: number; y: number; w: number; h: number } {
  const r = { x: l.x - l.w / 2, y: l.y - l.h * 0.82, w: l.w, h: l.h };
  const angle = ((l.angle ?? 0) * Math.PI) / 180;
  if (!angle) return r;
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => ({
    x: l.x + (x - l.x) * Math.cos(angle) - (y - l.y) * Math.sin(angle), y: l.y + (x - l.x) * Math.sin(angle) + (y - l.y) * Math.cos(angle),
  }));
  const x = Math.min(...pts.map(p => p.x)), y = Math.min(...pts.map(p => p.y));
  return { x, y, w: Math.max(...pts.map(p => p.x)) - x, h: Math.max(...pts.map(p => p.y)) - y };
}

export const rectOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = 0) =>
  Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) - pad && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) - pad;

/** Labels over blocks or over each other (V2 uiLabelConflicts). */
export function labelConflicts(labels: Record<string, EngineLabel | undefined>, geo: Geometry): number {
  let count = 0;
  const entries = Object.values(labels).filter((x): x is EngineLabel => !!x);
  for (let i = 0; i < entries.length; i++) {
    const r = labelRect(entries[i]);
    for (const b of geo.boxes) if (rectOverlap(r, b)) count++;
    for (let j = i + 1; j < entries.length; j++) if (rectOverlap(r, labelRect(entries[j]))) count++;
  }
  return count;
}

/** No two blocks overlap (V2 uiNoOverlap). */
export const noOverlap = (geo: Geometry) =>
  geo.boxes.every((a, i) => geo.boxes.slice(i + 1).every(b => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));

export interface Metrics extends PathMetrics { shared: number; unrelated: number; rejoined: number; labelConflicts: number; unwanted: number }

/** Everything measured on a plan (V2 v4Measure). */
export function measure(p: { m: EngineModel; geo: Geometry; paths: Paths; labels: Record<string, EngineLabel | undefined> }): Metrics {
  const out = { ...pathMetrics(p.paths, p.m, p.geo), ...classify(p.paths, p.m), labelConflicts: labelConflicts(p.labels, p.geo), unwanted: 0 };
  out.unwanted = out.unrelated + out.rejoined;
  return out;
}

/** Lower is better (V2 v4Score). */
export const score = (x: Metrics) => x.invalid * 1e12 + x.crossings * 1e8 + x.unwanted * 1e4 + x.labelConflicts * 1e6 + x.bends * 500 + x.length;

/** A plan may be applied: valid, blocks apart, and no worse than the original in crossings, unwanted overlap and label conflicts (V2 v4Allowed). */
export const allowed = (p: { metrics: Metrics; geo: Geometry }, base: { metrics: Metrics }) =>
  p.metrics.invalid === 0 && noOverlap(p.geo) && p.metrics.crossings <= base.metrics.crossings
  && p.metrics.unwanted <= base.metrics.unwanted + 0.01 && p.metrics.labelConflicts <= base.metrics.labelConflicts;
