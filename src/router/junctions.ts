// Junction topology clean-up (V2 afCleanJunctions L1085, run by V2 on every render, commit,
// draw, load and save — L1122–1126). V3 runs it once in the commit step and when loading.
//
//   1. wires whose ends point nowhere, or from an end to itself, are dropped;
//   2. a junction with fewer than two wires goes, with its wire;
//      a junction with exactly two wires is merged away: the two wires become one (the first
//      wire keeps its id and format, takes the second's arrow; its stored route is dropped);
//   3. junctions not connected (through wires and junctions) to any block go, with their wires.
//
// V2's automatic shared-junction creation and corner branching (splitAtCorner L353,
// beginCornerBranch, afNormalizeSharedBranches) were switched off in V2 (L1304–1306,
// "Direct endpoint wiring") and are not ported. V3 junctions have no lock of their own
// (V2 afLocked on junctions only exempted them from step 2).
import { clone } from '../core/ids';
import type { BlockDiagram, Wire, WireEnd } from '../io/schema-types';

const key = (e: WireEnd) => JSON.stringify(e);
const atJunction = (e: WireEnd, id: string) => 'junction' in e && e.junction === id;

/** Returns a cleaned copy; `changed` tells whether anything was removed or merged. */
export function cleanJunctions(src: BlockDiagram): { data: BlockDiagram; changed: boolean } {
  const d = clone(src);
  const ports = new Map(d.blocks.map(b => [b.id, new Set(b.ports.map(p => p.id))]));
  const validEnd = (e: WireEnd) => ('junction' in e ? d.junctions.some(j => j.id === e.junction) : !!ports.get(e.block)?.has(e.port));
  d.wires = d.wires.filter(w => validEnd(w.a) && validEnd(w.b) && key(w.a) !== key(w.b));

  for (let round = 0; round < 500; round++) {
    let changed = false;
    for (const j of [...d.junctions]) {
      const es = d.wires.filter(w => atJunction(w.a, j.id) || atJunction(w.b, j.id));
      if (es.length < 2) {
        d.wires = d.wires.filter(w => !es.includes(w));
        d.junctions = d.junctions.filter(x => x !== j);
        changed = true; break;
      }
      if (es.length === 2) {
        const [a, b] = es;
        const other = (w: Wire) => (atJunction(w.a, j.id) ? w.b : w.a);
        const first = es.find(w => atJunction(w.b, j.id)) ?? a, second = first === a ? b : a;
        const merged: Wire = { ...first, a: clone(other(first)), b: clone(other(second)), line: { ...first.line, arrow: !!second.line.arrow }, name: first.name || second.name || '' };
        delete merged.route;
        d.wires = d.wires.filter(w => !es.includes(w));
        if (key(merged.a) !== key(merged.b)) d.wires.push(merged);
        d.junctions = d.junctions.filter(x => x !== j);
        changed = true; break;
      }
    }
    if (!changed) break;
  }

  // junction-only islands, including closed loops not attached to any block
  const reachable = new Set<string>(), queue: string[] = [];
  for (const w of d.wires) {
    if ('block' in w.a && 'junction' in w.b && !reachable.has(w.b.junction)) { reachable.add(w.b.junction); queue.push(w.b.junction); }
    if ('block' in w.b && 'junction' in w.a && !reachable.has(w.a.junction)) { reachable.add(w.a.junction); queue.push(w.a.junction); }
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const w of d.wires) {
      const next = atJunction(w.a, id) && 'junction' in w.b ? w.b.junction : atJunction(w.b, id) && 'junction' in w.a ? w.a.junction : null;
      if (next && !reachable.has(next)) { reachable.add(next); queue.push(next); }
    }
  }
  d.junctions = d.junctions.filter(j => reachable.has(j.id));
  d.wires = d.wires.filter(w => (!('junction' in w.a) || reachable.has(w.a.junction)) && (!('junction' in w.b) || reachable.has(w.b.junction)));

  return { data: d, changed: JSON.stringify(d.wires) !== JSON.stringify(src.wires) || d.junctions.length !== src.junctions.length };
}

/** Number of wires meeting at each junction. */
export function junctionDegrees(d: BlockDiagram): Map<string, number> {
  const out = new Map(d.junctions.map(j => [j.id, 0]));
  for (const w of d.wires) for (const e of [w.a, w.b]) if ('junction' in e && out.has(e.junction)) out.set(e.junction, out.get(e.junction)! + 1);
  return out;
}
