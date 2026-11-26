// Editing a wire's path by hand (pure, input unchanged). V2 (legacy/app.zh-Hant.html):
//   - drag a segment of the selected wire sideways (grid bar L1552–L1560: `.segment` /
//     `.gg-route-handle`, the 2-point straight wire gets a jog);
//   - drag a corner of the selected wire (rc48 corner handles L2117–L2152, `cornerPath`);
//   - Shift-drag a pin along the block edge (gg port drag L1553 / V1 `project`).
// The result is stored as the wire's complete path (`route` starting at the wire's start point,
// `routing: 'manual'`); the caller validates it with the router and refuses invalid paths, as V2
// did ("the target intersects a block").
import { simplify, type Point } from '../core/geometry';
import { portAt } from '../core/grid';
import { updatePort, updateWire, blockOf } from './diagram';
import type { BlockDiagram } from './types';

/** Distance a jog leaves a pin before turning, when an end segment is dragged (V2 grid: one cell). */
export const JOG = 20;

const horizontal = (a: Point, b: Point) => Math.abs(a.y - b.y) < 1e-6;

/**
 * The path with segment `index` (ps[index] → ps[index + 1]) moved across itself by `delta`
 * (y for a horizontal segment, x for a vertical one). An end segment keeps the pin where it is
 * and gets a short jog out of it first. Null when the segment is neither horizontal nor vertical
 * or does not exist.
 */
export function moveSegment(ps: readonly Point[], index: number, delta: number, jog = JOG): Point[] | null {
  const a = ps[index], b = ps[index + 1];
  if (!a || !b || delta === 0) return delta === 0 && a && b ? [...ps] : null;
  const hz = horizontal(a, b);
  if (!hz && Math.abs(a.x - b.x) > 1e-6) return null;
  const shift = (p: Point): Point => (hz ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y });
  const along = (from: Point, to: Point): Point => {
    // a point `jog` from `from` towards `to` (at most half the segment)
    const len = hz ? to.x - from.x : to.y - from.y, step = Math.sign(len) * Math.min(jog, Math.abs(len) / 2);
    return hz ? { x: from.x + step, y: from.y } : { x: from.x, y: from.y + step };
  };
  const out = [...ps];
  const head: Point[] = [], tail: Point[] = [];
  let na = shift(a), nb = shift(b);
  if (index === 0) { const j = along(a, b); head.push(a, j); na = shift(j); }
  if (index + 1 === ps.length - 1) { const j = along(b, a); tail.push(j, b); nb = shift(j); }
  const before = index === 0 ? [] : out.slice(0, index), after = index + 1 === ps.length - 1 ? [] : out.slice(index + 2);
  return simplify([...before, ...head, na, nb, ...tail, ...after]);
}

/**
 * The path with corner `index` moved to `q` (V2 cornerPath): the two segments meeting there
 * follow so the path stays orthogonal. Null when `index` is not a corner between two segments.
 */
export function moveCorner(ps: readonly Point[], index: number, q: Point): Point[] | null {
  const prev = ps[index - 1], cur = ps[index], next = ps[index + 1];
  if (!prev || !cur || !next) return null;
  let repl: Point[];
  if (horizontal(prev, cur) && Math.abs(cur.x - next.x) < 1e-6) repl = [{ x: q.x, y: prev.y }, q, { x: next.x, y: q.y }];
  else if (Math.abs(prev.x - cur.x) < 1e-6 && horizontal(cur, next)) repl = [{ x: prev.x, y: q.y }, q, { x: q.x, y: next.y }];
  else return null;
  return simplify([...ps.slice(0, index), ...repl, ...ps.slice(index + 1)]);
}

/** Store a hand-edited complete path on a wire. */
export function setManualPath(d: BlockDiagram, wireId: string, ps: readonly Point[]): BlockDiagram {
  return updateWire(d, wireId, { route: ps.map(p => ({ x: p.x, y: p.y })), routing: 'manual' });
}

/**
 * Slide a pin to the block edge nearest `at` (V2 Shift-drag a pin / `project`): side and
 * position snap to the grid step `g` (1 without grid). Manual routes of its wires are dropped.
 */
export function slidePort(d: BlockDiagram, blockId: string, portId: string, at: Point, g: number): BlockDiagram {
  const b = blockOf(d, blockId);
  if (!b) return d;
  const place = portAt(b, at, g);
  const data = updatePort(d, blockId, portId, place);
  for (const w of data.wires) {
    if (w.locked) continue;
    if ([w.a, w.b].some(e => 'block' in e && e.block === blockId && e.port === portId)) { delete w.route; delete w.routing; }
  }
  return data;
}

/** Pin a wire label by hand (V2 afLabelMark: x, y, angle 0–359) or, with null, give it back to the automatic place. */
export function setLabelMark(d: BlockDiagram, wireId: string, mark: { x: number; y: number; angle: number } | null): BlockDiagram {
  const w = d.wires.find(x => x.id === wireId);
  if (!w) return d;
  const label = { ...w.label };
  if (mark) label.mark = { x: mark.x, y: mark.y, angle: ((Math.round(mark.angle) % 360) + 360) % 360 };
  else delete label.mark;
  return updateWire(d, wireId, { label });
}
