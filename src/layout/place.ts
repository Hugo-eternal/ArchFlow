// layout — moving blocks for the layout-mode candidates (V2 RC3, legacy/app.zh-Hant.html):
// uiFrozenNodes L1691 (locked blocks, blocks with a locked port or a locked wire stay put),
// uiPortFrozen L1692, uiLayout L1695 (expanded: spread from the top-left corner ×1.65 on a wide
// canvas; layered: rank blocks along the connections, columns left to right, each block near the
// middle of what it feeds). uiOrderPorts (L1703) is only used when the plan may move ports, which
// the organize dialog never allows (permissions.ports = false), so it is not ported.
import type { Port } from '../io/schema-types';
import type { EngineModel, EngineNode, Geometry } from './model';

export class LayoutError extends Error {
  constructor(readonly code: 'junctions' | 'cycles' | 'protected' | 'unauthorized' | 'overlap' | 'limit' | 'selection') { super(code); }
}

/** Blocks the layout must not move (V2 uiFrozenNodes). */
export function frozenNodes(m: EngineModel): Set<string> {
  const set = new Set<string>();
  for (const n of m.nodes) if (n.locked || n.ports.some(p => p.locked)) set.add(n.id);
  for (const e of m.edges) if (e.locked) { if ('node' in e.a) set.add(e.a.node); if ('node' in e.b) set.add(e.b.node); }
  return set;
}

/** A port that must not move (V2 uiPortFrozen). */
export const portFrozen = (n: EngineNode, p: Port, m: EngineModel) =>
  n.locked || p.locked || m.edges.some(e => e.locked && (('node' in e.a && e.a.node === n.id && e.a.port === p.id) || ('node' in e.b && e.b.node === n.id && e.b.port === p.id)));

export type LayoutKind = 'preserved' | 'expanded' | 'layered';

/** Move the blocks of `m` (in place) for a layout kind (V2 uiLayout; `space` 'wide' as the dialog uses). */
export function place(m: EngineModel, baseGeo: Geometry, kind: Exclude<LayoutKind, 'preserved'>, space = 'wide'): void {
  const frozen = frozenNodes(m), g = baseGeo.grid, snap = (v: number) => Math.round(v / g) * g;
  const by = new Map(m.nodes.map(n => [n.id, n])), dims = new Map(baseGeo.boxes.map(n => [n.id, n]));
  if (m.junctions.length && kind === 'layered') throw new LayoutError('junctions');
  const factor = space === 'wide' ? 1.65 : 1.3;
  if (kind === 'expanded') {
    const minX = Math.min(...m.nodes.map(n => n.x)), minY = Math.min(...m.nodes.map(n => n.y));
    for (const n of m.nodes) if (!frozen.has(n.id)) { n.x = snap(minX + (n.x - minX) * factor); n.y = snap(minY + (n.y - minY) * factor); }
    return;
  }
  const outs = new Map(m.nodes.map(n => [n.id, [] as string[]])), degree = new Map(m.nodes.map(n => [n.id, 0])), rank = new Map(m.nodes.map(n => [n.id, 0]));
  for (const e of m.edges) if ('node' in e.a && 'node' in e.b && e.a.node !== e.b.node) {
    outs.get(e.a.node)?.push(e.b.node);
    degree.set(e.b.node, degree.get(e.b.node)! + 1);
  }
  const queue = m.nodes.filter(n => degree.get(n.id) === 0).map(n => n.id), ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of outs.get(id)!) {
      rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1));
      degree.set(next, degree.get(next)! - 1);
      if (!degree.get(next)) queue.push(next);
    }
  }
  if (ordered.length !== m.nodes.length) throw new LayoutError('cycles');
  const maxRank = Math.max(...rank.values());
  for (const n of m.nodes) if (!outs.get(n.id)!.length && rank.get(n.id)! > 0) rank.set(n.id, maxRank);
  const layers: EngineNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of m.nodes) layers[rank.get(n.id)!].push(n);
  for (const layer of layers) layer.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const gap = space === 'wide' ? 400 : 260, rowGap = space === 'wide' ? 170 : 100;
  const desired = new Map<string, number>();
  for (let r = maxRank; r >= 0; r--) {
    const layer = layers[r];
    for (const n of layer) {
      const children = outs.get(n.id)!;
      desired.set(n.id, children.length ? children.reduce((s, id) => s + (desired.get(id) ?? by.get(id)!.y), 0) / children.length : n.y);
    }
    layer.sort((a, b) => desired.get(a.id)! - desired.get(b.id)! || a.y - b.y);
    let y = 160;
    for (const n of layer) {
      const h = dims.get(n.id)!.h;
      if (r === maxRank) { desired.set(n.id, y + h / 2); y += h + rowGap; }
      else { const center = Math.max(y + h / 2, desired.get(n.id)!); desired.set(n.id, center); y = center + h / 2 + rowGap; }
    }
  }
  let x = 120;
  for (let r = 0; r <= maxRank; r++) {
    for (const n of layers[r]) if (!frozen.has(n.id)) { n.x = snap(x); n.y = snap(desired.get(n.id)! - dims.get(n.id)!.h / 2); }
    x += Math.max(200, ...layers[r].map(n => dims.get(n.id)!.w)) + gap;
  }
}
