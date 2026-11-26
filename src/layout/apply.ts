// layout — applying an organize candidate to the diagram (V2 v4Apply L1851): block positions,
// the re-routed wires as whole polylines in `wire.route` (routing 'manual'), and the arranged
// label spots in `wire.label.auto` (valid while the route stays the same; manual marks and
// locked wires untouched). The result is checked like V2: re-routing it must give exactly the
// previewed paths, else nothing is applied.
import type { BlockDiagram } from '../io/schema-types';
import { simplify } from '../core/geometry';
import { routeAll } from '../router/full-path';
import { copy } from './model';
import { allowed, noOverlap } from './metrics';
import { verify, type OrganizePlan } from './plan';
import { LayoutError } from './place';

export const routeSignature = (ps: readonly { x: number; y: number }[]) => JSON.stringify(simplify(ps).map(p => ({ x: p.x, y: p.y })));

export class ApplyError extends Error {
  constructor(readonly code: 'unsafe' | 'mismatch') { super(code); }
}

/** The diagram with candidate `index` of `plan` applied (pure). */
export function applyCandidate(d: BlockDiagram, plan: OrganizePlan, index: number): BlockDiagram {
  const c = plan.candidates[index], base = plan.base;
  if (!c || index === 0) throw new ApplyError('unsafe');
  try { verify(base.m, c.m, c.geo, base.paths, c.paths, plan.permissions); } catch (e) { if (e instanceof LayoutError) throw new ApplyError('unsafe'); throw e; }
  if (!allowed(c, base) || c.metrics.invalid || !noOverlap(c.geo)) throw new ApplyError('unsafe');
  const out = copy(d);
  for (const b of out.blocks) { const n = c.m.nodes.find(x => x.id === b.id); if (n) { b.x = n.x; b.y = n.y; } }
  const p = plan.permissions;
  for (const w of out.wires) {
    const ps = c.paths[w.id];
    if (ps && (c.changes.routes.includes(w.id) || (c.kind === 'refined' && !w.locked))) { w.route = copy(ps); w.routing = 'manual'; }
    const l = c.labels[w.id];
    if (l && !w.label?.mark && !w.locked && (p.scope === 'all' || p.ids.includes(w.id)) && ps) {
      w.label = { ...w.label, auto: { x: l.x, y: l.y, signature: routeSignature(ps) } };
    }
  }
  // what the canvas will route must be what was previewed (V2 cancelled otherwise)
  const now = routeAll(out);
  for (const w of out.wires) if (c.paths[w.id] && routeSignature(now.get(w.id)?.ps ?? []) !== routeSignature(c.paths[w.id])) throw new ApplyError('mismatch');
  return out;
}

/** A candidate as a diagram to draw (block positions, routes as previewed), for the dialog's preview. */
export function previewOf(d: BlockDiagram, c: OrganizePlan['candidates'][number]): { data: BlockDiagram; routes: Map<string, { ps: { x: number; y: number }[]; valid: boolean; failed: boolean }> } {
  const data = copy(d);
  for (const b of data.blocks) { const n = c.m.nodes.find(x => x.id === b.id); if (n) { b.x = n.x; b.y = n.y; } }
  for (const w of data.wires) { const l = c.labels[w.id]; if (l && !w.label?.mark) w.label = { ...w.label, auto: { x: l.x, y: l.y, signature: routeSignature(c.paths[w.id] ?? []) } }; }
  return { data, routes: new Map(data.wires.map(w => [w.id, { ps: c.paths[w.id] ?? [], valid: true, failed: false }])) };
}
