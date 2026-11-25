// Grid: spacing, snapping, and the normalisation that keeps a block diagram on the grid.
//
// V2: the "V1.4 integrated grid" L1474–1565 (ggValid / ggSnap / ggOn / ggAnchor / ggNormalize /
// ggProtect / ggChecks) plus the commit wrapper L1535 that normalised before every commit.
// V3 differences:
//   * `grid.snap` replaces `afGrid.enabled`; port offsets are derived from `t` (no afGridOffset).
//   * Everything is pure: `normalize` returns a new diagram or throws a GridError, and the
//     commit step (core/commands → history) decides whether to keep it. No DOM measuring —
//     V3 blocks always carry w / h.
//   * The legacy off-grid adapters (ggLegacy, roLegacyNote) are not ported (audit §4.2).
import type { Block, BlockDiagram, Grid, Point, Port, WireEnd } from '../io/schema-types';
import { clone } from './ids';
import { same, simplify } from './geometry';

export const GRID_MIN = 5;
export const GRID_MAX = 40;
export const GRID_STEP = 5;
export const GRID_DEFAULT = 10;
export const GRID_PRESETS = [10, 20, 40] as const;
export const DEFAULT_GRID: Readonly<Grid> = Object.freeze({ size: GRID_DEFAULT, show: true, snap: true });

/** 5..40 in steps of 5 (V2 ggValid). */
export const isValidGridSize = (g: unknown): g is number =>
  typeof g === 'number' && Number.isInteger(g) && g >= GRID_MIN && g <= GRID_MAX && g % GRID_STEP === 0;

/** The spacing to use: the grid's own when valid, else the default (V2 ggSize). */
export const gridSize = (grid?: Partial<Grid> | null) => (isValidGridSize(grid?.size) ? grid!.size! : GRID_DEFAULT);

export const snapTo = (v: number, g: number) => Math.round(v / g) * g;
export const ceilTo = (v: number, g: number) => Math.ceil(v / g) * g;
export const isOnGrid = (v: number, g: number) => Number.isFinite(v) && Math.abs(v / g - Math.round(v / g)) < 1e-7;
export const snapPoint = (p: Point, g: number): Point => ({ x: snapTo(p.x, g), y: snapTo(p.y, g) });

/** Snap a coordinate when the grid has snapping on; otherwise leave it (V2 ArchFlowGridSnap). */
export const snapIfOn = (v: number, grid?: Partial<Grid> | null) => (grid?.snap ? snapTo(v, gridSize(grid)) : v);

const vertical = (side: Port['side']) => side === 'l' || side === 'r';
const sideLength = (b: Pick<Block, 'w' | 'h'>, side: Port['side']) => (vertical(side) ? b.h : b.w);

/** Distance of a port from the start of its side. */
export const portOffset = (b: Pick<Block, 'w' | 'h'>, p: Pick<Port, 'side' | 't'>) => sideLength(b, p.side) * p.t;

/** World position of a port (V2 anchor / ggAnchor). With a grid, the offset snaps to it. */
export function portPoint(b: Block, p: Pick<Port, 'side' | 't'>, g?: number): Point {
  const raw = portOffset(b, p), off = g ? snapTo(raw, g) : raw;
  return { x: b.x + (p.side === 'l' ? 0 : p.side === 'r' ? b.w : off), y: b.y + (p.side === 't' ? 0 : p.side === 'b' ? b.h : off) };
}

/** World position of a wire end; throws when it points nowhere. */
export function endPoint(end: WireEnd, d: Pick<BlockDiagram, 'blocks' | 'junctions'>, g?: number): Point {
  if ('junction' in end) {
    const j = d.junctions.find(j => j.id === end.junction);
    if (!j) throw new GridError('missing-end', end.junction);
    return { x: j.x, y: j.y };
  }
  const b = d.blocks.find(b => b.id === end.block), p = b?.ports.find(p => p.id === end.port);
  if (!b || !p) throw new GridError('missing-end', end.port);
  return portPoint(b, p, g);
}

/**
 * Where a port goes when dropped at world point `at` on block `b` (V2 `project` with the grid
 * on, L1517): the nearest side, offset snapped and kept one cell away from the corners.
 */
export function portAt(b: Pick<Block, 'x' | 'y' | 'w' | 'h'>, at: Point, g: number): Pick<Port, 'side' | 't'> {
  const choices: [Port['side'], number][] = [
    ['l', Math.abs(at.x - b.x)], ['r', Math.abs(at.x - b.x - b.w)], ['t', Math.abs(at.y - b.y)], ['b', Math.abs(at.y - b.y - b.h)],
  ];
  const side = choices.sort((a, c) => a[1] - c[1])[0][0];
  const len = sideLength(b, side);
  const off = Math.max(g, Math.min(len - g, snapTo(vertical(side) ? at.y - b.y : at.x - b.x, g)));
  return { side, t: off / len };
}

export type GridErrorCode =
  | 'invalid-size' | 'locked-port' | 'locked-block' | 'locked-junction' | 'locked-wire' | 'missing-end';

/** A normalisation that would break something locked. `id` names the item (for the message). */
export class GridError extends Error {
  constructor(readonly code: GridErrorCode, readonly id = '') { super(`${code}${id ? ': ' + id : ''}`); this.name = 'GridError'; }
}

const SIDES = ['l', 'r', 't', 'b'] as const;

export interface NormalizeOptions {
  /** Drop the route of every unlocked wire so the router redraws it on the grid (V2 ggConvert). */
  resetRoutes?: boolean;
  /** Refuse (throw) instead of moving locked items. Default true. */
  locks?: boolean;
}

/**
 * Put a block diagram on grid `g` (V2 ggNormalize): block positions snap, sizes round up,
 * ports go to grid points at least two cells apart and one cell from the corners (blocks grow
 * to fit them), junctions and manual routes snap. Returns a new diagram; throws GridError.
 */
export function normalize(src: BlockDiagram, g: number, { resetRoutes = false, locks = true }: NormalizeOptions = {}): BlockDiagram {
  if (!isValidGridSize(g)) throw new GridError('invalid-size', String(g));
  const before = src, d = clone(src);
  const round = (v: number) => snapTo(v, g), up = (v: number) => ceilTo(v, g);
  d.grid = { size: g, show: src.grid?.show !== false, snap: true };

  for (const b of d.blocks) {
    const old = before.blocks.find(x => x.id === b.id)!;
    b.x = round(b.x); b.y = round(b.y);
    const min = b.part ? 20 : 0;
    if (b.sizing === 'free') { b.w = up(Math.max(20, b.w || 200)); b.h = up(Math.max(20, b.h || 100)); }
    else { b.w = up(Math.max(min || 120, b.w || 200)); b.h = up(Math.max(min || 60, b.h || 100)); }

    const offsets = new Map<string, number>();
    for (const side of SIDES) {
      const ports = b.ports.filter(p => p.side === side), dim = vertical(side) ? 'h' : 'w';
      const desired = (p: Port) => { const o = old.ports.find(x => x.id === p.id) ?? p; return sideLength(old, side) * o.t; };
      const used: number[] = [];
      for (const p of ports.filter(p => p.locked)) {
        const v = desired(p);
        if (locks && !isOnGrid(v, g)) throw new GridError('locked-port', p.id);
        const off = Math.max(g, round(v));
        offsets.set(p.id, off); used.push(off); b[dim] = Math.max(b[dim], off + g);
      }
      for (const p of ports.filter(p => !p.locked).sort((a, c) => desired(a) - desired(c))) {
        let v = Math.max(g, round(desired(p)));
        while (used.some(x => Math.abs(x - v) < 2 * g)) v += g;
        offsets.set(p.id, v); used.push(v); b[dim] = Math.max(b[dim], v + g);
      }
      for (const p of ports) p.t = offsets.get(p.id)! / b[dim];
    }

    if (locks && old.locked) {
      const moved = (['x', 'y', 'w', 'h'] as const).some(k => Math.abs(old[k] - b[k]) > 0.01)
        || b.ports.some(p => { const o = old.ports.find(x => x.id === p.id); return o && Math.abs(portOffset(old, o) - offsets.get(p.id)!) > 0.01; });
      if (moved) throw new GridError('locked-block', b.partNumber || b.id);
    }
  }

  for (const j of d.junctions) {
    // V3 junctions have no lock of their own: they move with their wires
    j.x = round(j.x); j.y = round(j.y);
  }

  const wasOnGrid = before.grid?.snap === true && isValidGridSize(before.grid.size);
  for (const w of d.wires) {
    if (resetRoutes && !w.locked) delete w.route;
    if (w.locked) {
      if (!locks) continue;
      const old = before.wires.find(x => x.id === w.id)!;
      const offGrid = (w.route ?? []).some(p => !isOnGrid(p.x, g) || !isOnGrid(p.y, g));
      const endsMoved = wasOnGrid && (
        !same(endPoint(old.a, before, before.grid.size), endPoint(w.a, d, g)) ||
        !same(endPoint(old.b, before, before.grid.size), endPoint(w.b, d, g)));
      if (offGrid || endsMoved) throw new GridError('locked-wire', w.id);
    } else if (w.route) w.route = simplify(w.route.map(p => snapPoint(p, g)));
  }
  return d;
}

/**
 * Refuse an edit that changed something locked (V2 ggProtect, run on every commit while the
 * grid is on). `before` and `after` are consecutive states of the same diagram.
 */
export function protect(before: BlockDiagram, after: BlockDiagram): void {
  if (!before.grid?.snap) return;
  const g = gridSize(before.grid), g2 = gridSize(after.grid);
  for (const b of before.blocks) {
    const next = after.blocks.find(x => x.id === b.id);
    if (!next) continue;
    if (b.locked && (['x', 'y', 'w', 'h'] as const).some(k => b[k] !== next[k])) throw new GridError('locked-block', b.partNumber || b.id);
    for (const p of b.ports) {
      const q = next.ports.find(x => x.id === p.id);
      if (p.locked && q && (p.side !== q.side || Math.abs(portOffset(b, p) - portOffset(next, q)) > 1e-6)) throw new GridError('locked-port', p.id);
    }
  }
  for (const w of before.wires) {
    const next = after.wires.find(x => x.id === w.id);
    if (!w.locked || !next?.locked) continue;
    if (JSON.stringify(w.a) !== JSON.stringify(next.a) || JSON.stringify(w.b) !== JSON.stringify(next.b)
      || !same(endPoint(w.a, before, g), endPoint(next.a, after, g2)) || !same(endPoint(w.b, before, g), endPoint(next.b, after, g2))
      || JSON.stringify(w.route ?? null) !== JSON.stringify(next.route ?? null)) throw new GridError('locked-wire', w.id);
  }
}

export type GridCheckId = 'enabled' | 'size' | 'blocks' | 'ports' | 'portSpacing' | 'noOverlap' | 'junctions' | 'routes';
export interface GridCheck { id: GridCheckId; pass: boolean }

/**
 * Grid health (V2 ggChecks, the "Check grid" dialog). Route legality needs the router and is
 * added by router/ (step 3.16); here only the geometry that core can judge.
 */
export function checks(d: BlockDiagram): GridCheck[] {
  const out: GridCheck[] = [{ id: 'enabled', pass: d.grid?.snap === true }];
  if (!d.grid?.snap) return out;
  const g = gridSize(d.grid), on = (v: number) => isOnGrid(v, g);
  const off = (b: Block, p: Port) => portOffset(b, p);
  out.push(
    { id: 'size', pass: isValidGridSize(d.grid.size) },
    { id: 'blocks', pass: d.blocks.every(b => [b.x, b.y, b.w, b.h].every(on)) },
    { id: 'ports', pass: d.blocks.every(b => b.ports.every(p => { const o = off(b, p); return on(o) && o >= g - 1e-6 && o <= sideLength(b, p.side) - g + 1e-6; })) },
    { id: 'portSpacing', pass: d.blocks.every(b => b.ports.every((p, i) => b.ports.slice(i + 1).every(q => p.side !== q.side || Math.abs(off(b, p) - off(b, q)) >= 2 * g - 1e-6))) },
    { id: 'noOverlap', pass: d.blocks.every((a, i) => d.blocks.slice(i + 1).every(b => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)) },
    { id: 'junctions', pass: d.junctions.every(j => on(j.x) && on(j.y)) },
    { id: 'routes', pass: d.wires.every(w => (w.route ?? []).every(p => on(p.x) && on(p.y))) },
  );
  return out;
}
