// Small layout edits of a block diagram (pure, input unchanged): align selected blocks (V2
// uxAlign, legacy L1398) and arrange a block's pins by where their wires go (V2 afArrangeIO,
// L1263; the "Auto-arrange I/O by connections" button of the block inspector).
import { clone } from '../core/ids';
import { endPoint } from '../core/grid';
import type { Block, BlockDiagram, Port, WireEnd } from './types';

export type AlignAxis = 'horizontal' | 'vertical';

/** Blocks that `alignBlocks` would use: selected, existing, unlocked, in selection order. */
export function alignable(d: BlockDiagram, ids: readonly string[]): Block[] {
  return ids.map(id => d.blocks.find(b => b.id === id)).filter((b): b is Block => !!b && !b.locked);
}

/**
 * Centre the blocks on the first one's centre line: 'horizontal' = same centre y (a row),
 * 'vertical' = same centre x (a column). Locked blocks are left out. The manual routes of the
 * wires of moved blocks are dropped (the router redraws them). Null when fewer than two blocks.
 */
export function alignBlocks(d: BlockDiagram, ids: readonly string[], axis: AlignAxis): { data: BlockDiagram; moved: string[] } | null {
  const ns = alignable(d, ids);
  if (ns.length < 2) return null;
  const ref = ns[0], key = axis === 'horizontal' ? 'y' : 'x', len = axis === 'horizontal' ? 'h' : 'w';
  const target = ref[key] + ref[len] / 2;
  const data = clone(d), moved: string[] = [];
  for (const n of ns.slice(1)) {
    const b = data.blocks.find(x => x.id === n.id)!, v = target - b[len] / 2;
    if (Math.abs(b[key] - v) > 0.01) { b[key] = v; moved.push(b.id); }
  }
  const set = new Set(moved);
  for (const w of data.wires) if (!w.locked && [w.a, w.b].some(e => 'block' in e && set.has(e.block))) delete w.route;
  return { data, moved };
}

const hasPort = (e: WireEnd, block: string, port: string) => 'block' in e && e.block === block && e.port === port;

/**
 * Arrange one block's pins (V2 afArrangeIO with orient = true): unlocked inputs go to the left,
 * outputs to the right ('TB': top / bottom); on each side the unlocked pins are ordered by the
 * mean position of what they connect to (along the side) and spread over free slots 0.06–0.94,
 * keeping clear of locked pins. Wires of the block lose their manual route.
 */
export function arrangePorts(d: BlockDiagram, blockId: string, direction: 'LR' | 'TB' = 'LR'): BlockDiagram {
  const data = clone(d), n = data.blocks.find(b => b.id === blockId);
  if (!n) return data;
  const horizontal = direction !== 'TB';
  for (const p of n.ports) if (!p.locked) {
    if (p.type === 'in') p.side = horizontal ? 'l' : 't';
    else if (p.type === 'out') p.side = horizontal ? 'r' : 'b';
  }
  const across = (side: Port['side']) => side === 'l' || side === 'r';
  for (const side of ['l', 'r', 't', 'b'] as const) {
    const ports = n.ports.filter(p => p.side === side), fixed = ports.filter(p => p.locked).map(p => p.t), free = ports.filter(p => !p.locked);
    const score = (p: Port) => {
      const pts = data.wires.flatMap(w => (hasPort(w.a, n.id, p.id) ? [w.b] : hasPort(w.b, n.id, p.id) ? [w.a] : []))
        .flatMap(e => { try { return [endPoint(e, d)]; } catch { return []; } });
      if (pts.length) return pts.reduce((v, a) => v + (across(side) ? a.y : a.x), 0) / pts.length;
      return p.t * (across(side) ? n.h : n.w) + (across(side) ? n.y : n.x);
    };
    const scored = new Map(free.map(p => [p, score(p)]));
    free.sort((a, b) => scored.get(a)! - scored.get(b)! || a.id.localeCompare(b.id));
    const slots: number[] = [], count = Math.max(ports.length * 3, 12);
    for (let i = 1; i <= count; i++) { const t = 0.06 + 0.88 * i / (count + 1); if (fixed.every(x => Math.abs(x - t) > 0.025)) slots.push(t); }
    const used = [...fixed];
    free.forEach((p, i) => {
      const ideal = (i + 1) / (free.length + 1);
      const t = slots.filter(s => used.every(x => Math.abs(x - s) > 0.018)).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
      if (t !== undefined) { p.t = t; used.push(t); }
    });
  }
  for (const w of data.wires) if (!w.locked && [w.a, w.b].some(e => 'block' in e && e.block === n.id)) delete w.route;
  return data;
}
