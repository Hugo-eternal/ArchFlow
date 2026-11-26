// Wiring a part (schematic symbol) quickly (V2 af15-ux2 L4151–L4230, `finish` L4209): a wire
// dragged from a part's lead and dropped on an ordinary block's body adds a pin on the nearest
// edge and connects to it; dropped on a part's body, it takes that part's free lead; a part's
// lead dropped on a wire splits the wire with a junction ("TAP n") and connects to it.
// Pure functions; the gesture validates the routes and refuses invalid results, as V2 did.
import { clone, uid } from '../core/ids';
import { endPoint } from '../core/grid';
import type { Point } from '../core/geometry';
import { addJunction, blockOf, connect, growForPorts, makePort } from './diagram';
import type { Block, BlockDiagram, Side, WireEnd } from './types';

/** The block whose box (6 px margin) contains `p`, top-most first, other than `skip` (V2 blockAt). */
export function blockAt(d: BlockDiagram, p: Point, skip?: string): Block | undefined {
  return [...d.blocks].reverse().find(b => b.id !== skip && p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6);
}

/** A part's lead for a new wire: an unused one first, then the nearest to `p` (V2 freeLead). */
export function freeLead(d: BlockDiagram, part: Block, p: Point): string | null {
  const used = new Set(d.wires.flatMap(w => [w.a, w.b]).filter(e => 'block' in e && e.block === part.id).map(e => (e as { port: string }).port));
  const leads = part.ports.map(q => ({ q, a: endPoint({ block: part.id, port: q.id }, d) }))
    .sort((x, y) => Number(used.has(x.q.id)) - Number(used.has(y.q.id)) || Math.hypot(x.a.x - p.x, x.a.y - p.y) - Math.hypot(y.a.x - p.x, y.a.y - p.y));
  return leads[0]?.q.id ?? null;
}

/** The edge of `b` nearest to `p` (V2 edgeSide). */
const edgeSide = (b: Block, p: Point): Side =>
  (Object.entries({ l: p.x - b.x, r: b.x + b.w - p.x, t: p.y - b.y, b: b.y + b.h - p.y }) as [Side, number][]).sort((x, y) => x[1] - y[1])[0][0];

/** A supply / ground symbol makes power wires and names the pin it adds (V2 addBlockPin / wire). */
const supply = (b: Block | undefined) => (b?.part?.kind === 'vcc' || b?.part?.kind === 'gnd' ? b.part.kind : null);

/**
 * Connect `from` (a pin) to `target`'s body near `p`: a part gives its free lead; an ordinary
 * block gets a new pin on its nearest edge (named after a supply / ground symbol, its label
 * hidden; type power / gnd / io). Null when nothing can be connected.
 */
export function connectToBody(d: BlockDiagram, from: { block: string; port: string }, targetId: string, p: Point): { data: BlockDiagram; wire: string; addedPort: string | null } | null {
  const src = blockOf(d, from.block), t = blockOf(d, targetId);
  if (!src || !t || !(src.part || t.part)) return null;
  const sym = src.part ? src : t, kind = supply(sym);
  let data = d, port: string | null, added: string | null = null;
  if (t.part) port = freeLead(d, t, p);
  else {
    const side = edgeSide(t, p), t01 = Math.max(0.1, Math.min(0.9, side === 'l' || side === 'r' ? (p.y - t.y) / t.h : (p.x - t.x) / t.w));
    const pin = makePort(kind === 'vcc' ? (sym.partNumber || 'VCC') : kind === 'gnd' ? 'GND' : '', side, Math.round(t01 * 1000) / 1000, kind === 'vcc' ? 'power' : kind === 'gnd' ? 'gnd' : 'io');
    if (kind) pin.label = 'hidden';                    // the symbol right outside already says it
    data = clone(d);
    const tb = data.blocks.find(b => b.id === t.id)!;
    tb.ports.push(pin);
    growForPorts(tb, true);
    port = added = pin.id;
  }
  if (!port) return null;
  const r = connect(data, from, { block: t.id, port }, { kind: kind ? 'power' : 'signal', line: { arrow: false } });
  return { data: r.data, wire: r.id, addedPort: added };
}

/**
 * The point on a wire nearest to `p` within `limit`, snapped to `g` and kept one step from the
 * segment ends (V2 nearestWire); wires of `skip` are left out.
 */
export function nearestWirePoint(d: BlockDiagram, routes: ReadonlyMap<string, { ps: Point[] }>, p: Point, limit: number, g: number, skip?: string): { wire: string; at: Point } | null {
  let best: { wire: string; at: Point; a: Point; b: Point; h: boolean } | null = null, lim = limit;
  for (const w of d.wires) {
    if (skip && [w.a, w.b].some(e => 'block' in e && e.block === skip)) continue;
    const ps = routes.get(w.id)?.ps ?? [];
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1], b = ps[i], h = Math.abs(a.y - b.y) < 0.01;
      if (!h && Math.abs(a.x - b.x) > 0.01) continue;
      const q = h ? { x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x)), y: a.y } : { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y)) };
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < lim) { lim = dist; best = { wire: w.id, at: q, a, b, h }; }
    }
  }
  if (!best) return null;
  const { at, a, b, h } = best;
  const lo = h ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi = h ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  if (hi - lo < 2 * g) return null;
  const v = Math.max(lo + g, Math.min(hi - g, Math.round((h ? at.x : at.y) / g) * g));
  return { wire: best.wire, at: h ? { x: v, y: at.y } : { x: at.x, y: v } };
}

/**
 * Split a wire at `at` with a new junction "TAP n" (V2 tapWire): the first part keeps the wire
 * (without its arrow and manual route), the second part is a copy from the junction on.
 */
export function tapWire(d: BlockDiagram, wireId: string, at: Point): { data: BlockDiagram; junction: string } {
  const j = addJunction(d, at, `TAP${d.junctions.length + 1}`);
  const data = j.data, w = data.wires.find(x => x.id === wireId)!;
  const right = { ...clone(w), id: uid(), a: { junction: j.id } as WireEnd };
  delete right.route; delete right.routing;
  w.b = { junction: j.id };
  delete w.route; delete w.routing;
  w.line = { ...w.line, arrow: false };
  data.wires.push(right);
  return { data, junction: j.id };
}
