// layout — organize plans: the candidates of the organize dialog, their checks and the choice of
// the best one (V2 RC3 / RC4, legacy/app.zh-Hant.html): uiProtected L1690, uiCandidate L1718 +
// L1759, uiChanges L1716, uiVerify L1717, v4Refine L1823–L1841, the computing part of v4Generate
// L1847 (limits, candidates per mode, wire-by-wire refinement, best choice). Pure: the diagram is
// never changed here; the shell shows the plan and applies a candidate (3.38).
import type { BlockDiagram } from '../io/schema-types';
import type { Measure } from '../render/texts';
import { routeAll } from '../router/full-path';
import { copy, currentPaths, fromDiagram, geometry, type EngineModel, type Geometry, type Paths } from './model';
import { allowed, measure as measureOf, noOverlap, score, type Metrics } from './metrics';
import { routes, NO_LIMIT, type Clock, type Permissions } from './route';
import { arrangeLabels, defaultLabels, liveLabels, type Labels } from './labels';
import { frozenNodes, LayoutError, place, portFrozen, type LayoutKind } from './place';

export { LayoutError } from './place';
export type CandidateKind = 'original' | 'refined' | LayoutKind;

export interface Changes { blocks: string[]; ports: string[]; routes: string[]; labels: string[] }
export interface Candidate { kind: CandidateKind; m: EngineModel; geo: Geometry; paths: Paths; labels: Labels; metrics: Metrics; changes: Changes; timedOut?: boolean }

/** The model without positions: connections, names and electrical data must not change (V2 uiProtected). */
function protectedPart(m: EngineModel): string {
  return JSON.stringify({
    nodes: m.nodes.map(({ x: _x, y: _y, ports, ...n }) => ({ ...n, ports: ports.map(({ t: _t, side: _s, ...p }) => p) })),
    edges: m.edges, junctions: m.junctions,
  });
}

/** What a plan changes (V2 uiChanges). */
export function changesOf(original: EngineModel, m: EngineModel, paths0: Paths, paths: Paths, labels0: Labels, labels: Labels): Changes {
  const out: Changes = { blocks: [], ports: [], routes: [], labels: [] };
  for (const n of m.nodes) {
    const old = original.nodes.find(x => x.id === n.id)!;
    if (n.x !== old.x || n.y !== old.y) out.blocks.push(n.id);
    for (const p of n.ports) { const op = old.ports.find(x => x.id === p.id)!; if (p.side !== op.side || Math.abs(p.t - op.t) > 1e-8) out.ports.push(`${n.id}/${p.id}`); }
  }
  for (const e of m.edges) {
    if (JSON.stringify(paths[e.id]) !== JSON.stringify(paths0[e.id])) out.routes.push(e.id);
    if (labels[e.id] && (labels[e.id].x !== labels0[e.id]?.x || labels[e.id].y !== labels0[e.id]?.y)) out.labels.push(e.id);
  }
  return out;
}

/** Refuse a plan that changes what it may not (V2 uiVerify). */
export function verify(original: EngineModel, m: EngineModel, geo: Geometry, paths0: Paths, paths: Paths, p: Permissions): void {
  if (protectedPart(original) !== protectedPart(m)) throw new LayoutError('protected');
  const frozen = frozenNodes(original);
  for (const n of m.nodes) {
    const old = original.nodes.find(x => x.id === n.id)!;
    if ((!p.blocks || frozen.has(n.id)) && (n.x !== old.x || n.y !== old.y)) throw new LayoutError('unauthorized');
    for (const port of n.ports) {
      const op = old.ports.find(x => x.id === port.id)!;
      if ((!p.ports || portFrozen(old, op, original)) && port.t !== op.t) throw new LayoutError('unauthorized');
      if ((!p.sides || portFrozen(old, op, original)) && port.side !== op.side) throw new LayoutError('unauthorized');
    }
  }
  for (const e of m.edges) if ((!p.routes || e.locked || (p.scope === 'selected' && !p.ids.includes(e.id))) && JSON.stringify(paths[e.id]) !== JSON.stringify(paths0[e.id])) throw new LayoutError('unauthorized');
  if (!noOverlap(geo)) throw new LayoutError('overlap');
}

const labelsFixed = (p: Permissions, e: EngineModel['edges'][number]) => !p.labels || e.locked || (p.scope === 'selected' && !p.ids.includes(e.id));

/** One candidate (V2 uiCandidate, both layers): move blocks, re-route, check, place labels, measure. */
export function candidate(source: EngineModel, geo0: Geometry, paths0: Paths, labels0: Labels, p: Permissions, kind: LayoutKind, measureText: Measure, clock: Clock = NO_LIMIT): Candidate {
  const m = copy(source);
  if (kind !== 'preserved') place(m, geo0, kind, p.space);
  const geo = geometry(m);
  for (const b of geo.boxes) { const o = geo0.boxes.find(x => x.id === b.id); if (o) { b.w = o.w; b.h = o.h; } }
  const paths = routes(m, geo, paths0, p, clock);
  verify(source, m, geo, paths0, paths, p);
  const defaults = defaultLabels(m, paths, measureText);
  for (const e of m.edges) if (labels0[e.id] && labelsFixed(p, e)) defaults[e.id] = { ...copy(labels0[e.id]), signature: JSON.stringify(paths[e.id]) };
  const labels = arrangeLabels(m, paths, geo, defaults, p);
  const plan = { kind, m, geo, paths, labels, metrics: undefined as unknown as Metrics, changes: changesOf(source, m, paths0, paths, labels0, labels) };
  plan.metrics = measureOf(plan);
  return plan;
}

export const hasChanges = (c: Candidate) => Object.values(c.changes).some(a => a.length > 0);

/**
 * Wire by wire: for up to 3 passes, try each re-routable wire's full-plan path or a fresh single
 * route, keeping a change only when the score drops and the plan stays acceptable (V2 v4Refine).
 */
export function refine(m: EngineModel, geo: Geometry, paths: Paths, labels: Labels, base: Candidate, full: Candidate | undefined, measureText: Measure, only: readonly string[] | null, clock: Clock = NO_LIMIT): Candidate | null {
  const perms: Permissions = { routes: true, blocks: false, ports: false, sides: false, labels: true, scope: 'selected', space: 'wide', ids: [] };
  const build = (ps: Paths, ids: string[]): Candidate => {
    const p = { ...perms, ids }, defaults = defaultLabels(m, ps, measureText);
    for (const e of m.edges) if (labels[e.id] && !ids.includes(e.id)) defaults[e.id] = { ...copy(labels[e.id]), signature: JSON.stringify(ps[e.id]) };
    const c = { kind: 'refined' as const, m, geo, paths: ps, labels: arrangeLabels(m, ps, geo, defaults, p), metrics: undefined as unknown as Metrics, changes: { blocks: [], ports: [], routes: [], labels: [] } };
    c.metrics = measureOf(c);
    return c;
  };
  const sig = (ps: unknown) => JSON.stringify(ps ?? []);
  let cur = base, ids: string[] = [], timedOut = false;
  const pool = m.edges.filter(e => !e.locked && (!only || only.includes(e.id)));
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const e of pool) {
      if (clock.now() > clock.deadline) { timedOut = true; break; }
      const k = sig(cur.paths[e.id]), alts: Paths[string][] = [];
      if (full?.paths[e.id] && sig(full.paths[e.id]) !== k) alts.push(full.paths[e.id]);
      try {
        const one = routes(m, geo, cur.paths, { ...perms, ids: [e.id] }, clock)[e.id];
        if (one && sig(one) !== k && !alts.some(a => sig(a) === sig(one))) alts.push(one);
      } catch { /* V2 ignored a failed single route */ }
      for (const alt of alts) {
        const nextIds = ids.includes(e.id) ? ids : [...ids, e.id];
        const c = build({ ...cur.paths, [e.id]: alt }, nextIds);
        if (c.metrics.invalid === 0 && score(c.metrics) < score(cur.metrics) && allowed(c, base)) { cur = c; ids = nextIds; improved = true; break; }
      }
    }
    if (!improved || timedOut) break;
  }
  if (cur === base) return null;
  return { ...cur, changes: changesOf(m, m, paths, cur.paths, labels, cur.labels), timedOut };
}

export type OrganizeMode = 'routes' | 'layout';
export interface OrganizeOptions {
  mode: OrganizeMode;
  /** Selected wires: only these are re-routed (routes mode only). */
  ids?: readonly string[];
  measure: Measure;
  clock?: Clock;
  /** The current labels (default: as the canvas draws them). */
  labels?: Labels;
}
export interface OrganizePlan { mode: OrganizeMode; permissions: Permissions; base: Candidate; candidates: Candidate[]; errors: { kind: CandidateKind; error: string }[]; best: number }

export const LIMITS = { blocks: 60, wires: 100 } as const;

/** The organize dialog's computation (V2 v4Generate): the original plus candidates, and the best one. */
export function organize(d: BlockDiagram, o: OrganizeOptions): OrganizePlan {
  const ids = [...(o.ids ?? [])], selected = ids.length > 0, clock = o.clock ?? NO_LIMIT;
  if (o.mode === 'layout' && selected) throw new LayoutError('selection');
  if (d.blocks.length > LIMITS.blocks || d.wires.length > LIMITS.wires) throw new LayoutError('limit');
  const m = fromDiagram(d), geo = geometry(m), paths = currentPaths(m, routeAll(d));
  const labels = o.labels ?? liveLabels(m, paths, o.measure);
  const base: Candidate = { kind: 'original', m, geo, paths, labels, metrics: undefined as unknown as Metrics, changes: { blocks: [], ports: [], routes: [], labels: [] } };
  base.metrics = measureOf(base);
  const permissions: Permissions = { routes: true, blocks: o.mode === 'layout', ports: false, sides: false, labels: true, scope: selected ? 'selected' : 'all', space: 'wide', ids };
  const candidates: Candidate[] = [base], errors: OrganizePlan['errors'] = [];
  for (const kind of (o.mode === 'layout' ? ['preserved', 'expanded', 'layered'] : ['preserved']) as LayoutKind[]) {
    try { candidates.push(candidate(m, geo, paths, labels, permissions, kind, o.measure, clock)); }
    catch (e) { if (e instanceof LayoutError) errors.push({ kind, error: e.code }); else throw e; }
  }
  const full = candidates.find(c => c.kind === 'preserved');
  const r = refine(m, geo, paths, labels, base, full, o.measure, selected ? ids : null, clock);
  if (r && hasChanges(r)) candidates.splice(1, 0, r); else errors.push({ kind: 'refined', error: 'noImprovement' });
  let best = 0;
  for (let i = 1; i < candidates.length; i++) if (hasChanges(candidates[i]) && candidates[i].metrics.invalid === 0 && allowed(candidates[i], base) && score(candidates[i].metrics) < score(candidates[best].metrics)) best = i;
  if (best === 0 && candidates.length > 1) { best = 1; for (let i = 2; i < candidates.length; i++) if (score(candidates[i].metrics) < score(candidates[best].metrics)) best = i; }
  return { mode: o.mode, permissions, base, candidates, errors, best };
}

/** Is a candidate ready to apply (the dialog's "Ready" mark)? */
export const ready = (plan: OrganizePlan, i: number) => i > 0 && hasChanges(plan.candidates[i]) && plan.candidates[i].metrics.invalid === 0 && allowed(plan.candidates[i], plan.base) && score(plan.candidates[i].metrics) < score(plan.base.metrics);
