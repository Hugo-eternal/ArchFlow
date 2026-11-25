// Hit testing in world coordinates, from the model geometry (not DOM event targets), so the
// same answers hold on the canvas, in tests and for touch. Tolerances are in screen pixels
// and divided by the zoom.
//
// Priority, top-most first (as drawn): ports, junctions, texts, wires, blocks (later blocks
// above earlier ones). V2 equivalents: nearest L315 (22 px port snap while wiring), the
// .wire-hit stroke, block / text elements.
import type { BlockDiagram } from '../io/schema-types';
import type { ItemRef } from '../model/types';
import { gridSize, portPoint } from '../core/grid';
import type { Point } from '../core/geometry';
import type { Route } from '../router/full-path';
import { frameTab } from '../render/frames';
import { textLayout, type Measure } from '../render/texts';

export interface HitOptions {
  zoom?: number;
  routes?: ReadonlyMap<string, Route>;
  measure?: Measure;
}

export const PORT_HIT = 8;        // px
export const SNAP_RADIUS = 22;    // px, while dragging a wire end (V2 nearest)
export const JUNCTION_HIT = 9;
export const WIRE_HIT = 6;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from p to segment ab. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const gridOf = (d: BlockDiagram) => (d.grid?.snap ? gridSize(d.grid) : undefined);

/** Nearest port within `radius` world units, optionally skipping one. */
export function nearestPort(d: BlockDiagram, p: Point, radius: number, skip?: { block: string; port: string }): { block: string; port: string; at: Point } | null {
  let best: { block: string; port: string; at: Point } | null = null, bd = radius;
  const g = gridOf(d);
  for (const b of d.blocks) for (const q of b.ports) {
    if (skip && skip.block === b.id && skip.port === q.id) continue;
    const at = portPoint(b, q, g), dd = dist(at, p);
    if (dd <= bd) { bd = dd; best = { block: b.id, port: q.id, at }; }
  }
  return best;
}

export function textBox(d: BlockDiagram, id: string, measure?: Measure) {
  const t = d.texts.find(x => x.id === id);
  if (!t) return null;
  return { x: t.x, y: t.y, w: t.w, h: textLayout(t, measure).height };
}

/** What is under world point p. */
export function hitTest(d: BlockDiagram, p: Point, o: HitOptions = {}): ItemRef | null {
  const z = o.zoom ?? 1;
  const port = nearestPort(d, p, PORT_HIT / z);
  if (port) return { kind: 'port', block: port.block, id: port.port };
  for (let i = d.junctions.length - 1; i >= 0; i--) if (dist(d.junctions[i], p) <= JUNCTION_HIT / z) return { kind: 'junction', id: d.junctions[i].id };
  for (let i = d.texts.length - 1; i >= 0; i--) {
    const r = textBox(d, d.texts[i].id, o.measure)!;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { kind: 'text', id: d.texts[i].id };
  }
  if (o.routes) for (let i = d.wires.length - 1; i >= 0; i--) {
    const ps = o.routes.get(d.wires[i].id)?.ps ?? [];
    for (let k = 1; k < ps.length; k++) if (segmentDistance(p, ps[k - 1], ps[k]) <= WIRE_HIT / z) return { kind: 'wire', id: d.wires[i].id };
  }
  for (let i = d.blocks.length - 1; i >= 0; i--) {
    const b = d.blocks[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return { kind: 'block', id: b.id };
  }
  for (let i = d.frames.length - 1; i >= 0; i--) {
    // frames are picked by their border (and title tab), not their inside, so blocks stay reachable
    const f = d.frames[i], tol = WIRE_HIT / z;
    const onX = p.x >= f.x - tol && p.x <= f.x + f.w + tol, onY = p.y >= f.y - tol && p.y <= f.y + f.h + tol;
    const nearEdge = Math.abs(p.x - f.x) <= tol || Math.abs(p.x - f.x - f.w) <= tol || Math.abs(p.y - f.y) <= tol || Math.abs(p.y - f.y - f.h) <= tol;
    if (onX && onY && nearEdge) return { kind: 'frame', id: f.id };
    const tab = frameTab(f, o.measure);
    if (p.x >= tab.x && p.x <= tab.x + tab.w && p.y >= tab.y && p.y <= tab.y + tab.h) return { kind: 'frame', id: f.id };
  }
  return null;
}

export interface Rect { x: number; y: number; w: number; h: number }
export const normRect = (a: Point, b: Point): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
const within = (r: Rect, x: number, y: number, w = 0, h = 0) => x >= r.x && y >= r.y && x + w <= r.x + r.w && y + h <= r.y + r.h;

/** Items entirely inside a box (blocks, texts, junctions, frames); wires whose both ends are selected. */
export function itemsInRect(d: BlockDiagram, r: Rect, measure?: Measure): ItemRef[] {
  const out: ItemRef[] = [];
  for (const b of d.blocks) if (within(r, b.x, b.y, b.w, b.h)) out.push({ kind: 'block', id: b.id });
  for (const t of d.texts) { const tb = textBox(d, t.id, measure)!; if (within(r, tb.x, tb.y, tb.w, tb.h)) out.push({ kind: 'text', id: t.id }); }
  for (const j of d.junctions) if (within(r, j.x, j.y)) out.push({ kind: 'junction', id: j.id });
  for (const f of d.frames) if (within(r, f.x, f.y, f.w, f.h)) out.push({ kind: 'frame', id: f.id });
  const picked = new Set(out.map(i => i.id));
  const endIn = (e: { block: string } | { junction: string }) => picked.has('junction' in e ? e.junction : e.block);
  for (const w of d.wires) if (endIn(w.a) && endIn(w.b)) out.push({ kind: 'wire', id: w.id });
  return out;
}
