// layout — wire labels for an organize plan (V2 RC3 / RC4, legacy/app.zh-Hant.html): uiMeasure
// L1711, uiDefaultLabels L1712, uiLiveLabels L1713 + L1812 (manual marks pinned), uiArrangeLabels
// L1714 (try spots along each segment, score overlaps with blocks, labels and wires), L1762
// (also try placing on the branch after a shared start; keep the arrangement with fewer
// conflicts, per wire), L1814 (manual marks stay where they are), v4Mark L1797.
// V2 measured label text on a canvas (500 weight Arial) + 10 px; here a Measure is passed in.
import { clear, simplify, type Point } from '../core/geometry';
import type { Measure } from '../render/texts';
import { labelPosition, wireLabel, LABEL_SIZE } from '../render/wires';
import { copy, pairs, type EngineEdge, type EngineModel, type Geometry, type Paths } from './model';
import { commonPrefix, labelConflicts, labelRect, rectOverlap, source, type EngineLabel } from './metrics';
import type { Permissions } from './route';

export interface Label extends EngineLabel {
  text: string; size: number;
  anchor?: Point; signature?: string;
  /** A manual mark: kept where it is (V2 pinned). */
  pinned?: boolean;
}
export type Labels = Record<string, Label>;

/** Label width as V2 measured it: text width + 10 px. */
export const labelWidth = (measure: Measure, text: string, size: number) => measure(text, size, false, false) + 10;

const mark = (e: EngineEdge) => e.wire.label?.mark ?? null;

/** Default spot: above the middle of the last horizontal segment longer than 95 px (V2 uiDefaultLabels). */
export function defaultLabels(m: EngineModel, paths: Paths, measure: Measure): Labels {
  const labels: Labels = {};
  for (const e of m.edges) {
    const text = wireLabel(e.wire, m.view);
    if (!text) continue;
    const ps = paths[e.id] ?? [], segments = pairs(ps), size = e.wire.label?.size ?? LABEL_SIZE;
    let seg: [Point, Point] = [ps[0] ?? { x: 0, y: 0 }, ps[1] ?? { x: 0, y: 0 }];
    for (let i = segments.length - 1; i >= 0; i--) if (segments[i][0].y === segments[i][1].y && Math.abs(segments[i][0].x - segments[i][1].x) > 95) { seg = segments[i]; break; }
    const [a, b] = seg;
    labels[e.id] = { x: (a.x + b.x) / 2, y: a.y - 12, w: labelWidth(measure, text, size), h: size * 1.25, text, size, anchor: { x: (a.x + b.x) / 2, y: a.y }, signature: JSON.stringify(ps) };
  }
  return labels;
}

/** The labels as drawn now (V2 read them off the canvas; V3 uses render/wires' placement), manual marks pinned (V2 uiLiveLabels + L1812). */
export function liveLabels(m: EngineModel, paths: Paths, measure: Measure): Labels {
  const labels = defaultLabels(m, paths, measure);
  for (const e of m.edges) {
    const l = labels[e.id];
    if (!l) continue;
    const pos = labelPosition(e.wire, paths[e.id] ?? []);
    if (pos) { l.x = pos.x; l.y = pos.y; }
    const mk = mark(e);
    if (mk) Object.assign(l, { x: mk.x, y: mk.y, angle: mk.angle, pinned: true });
  }
  return labels;
}

const editable = (e: EngineEdge, p: Permissions) => p.labels && !e.locked && (p.scope !== 'selected' || p.ids.includes(e.id));
const PAD = 8;

/** V2 uiArrangeLabels L1714: try spots at 1/2, 0.3, 0.7 of every segment ≥ 40 px, above / below, nearest first. */
function arrangeOnce(m: EngineModel, paths: Paths, geo: Geometry, initial: Labels, p: Permissions): Labels {
  const labels = copy(initial), placed: { x: number; y: number; w: number; h: number }[] = [];
  const boxes = geo.boxes.map(b => ({ x: b.x - PAD, y: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD }));
  for (const e of m.edges) {
    const label = labels[e.id];
    if (!label) continue;
    if (!editable(e, p)) { placed.push(labelRect(label)); continue; }
    const options: { candidate: Label; score: number }[] = [];
    for (const [a, b] of pairs(paths[e.id] ?? [])) {
      const horizontal = a.y === b.y, dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (dist < 40) continue;
      for (const f of [0.5, 0.3, 0.7]) for (const offset of [-12, -(label.h + 18), label.h + 12, -(label.h * 2 + 24), label.h * 2 + 24]) {
        const anchor = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        const candidate: Label = { ...label, x: horizontal ? anchor.x : anchor.x + label.w / 2 + 12, y: anchor.y + offset, anchor };
        const rect = labelRect(candidate);
        let score = 0;
        for (const box of boxes) if (rectOverlap(rect, box)) score += 100000;
        for (const other of placed) if (rectOverlap(rect, other, 6)) score += 50000;
        const r = { l: rect.x, r: rect.x + rect.w, t: rect.y, b: rect.y + rect.h };
        for (const [id, ps] of Object.entries(paths)) for (const [c, d] of pairs(ps)) if (!clear(c, d, [r])) score += id === e.id ? 100 : 1500;
        score += Math.abs(offset) * 2 + (horizontal ? 0 : 60) + (dist < label.w + 30 ? 400 : 0);
        options.push({ candidate, score });
      }
    }
    options.sort((x, y) => x.score - y.score);
    if (options.length) labels[e.id] = options[0].candidate;
    placed.push(labelRect(labels[e.id]));
  }
  return labels;
}

/** V2 L1762: also arrange on each wire's branch after the start it shares with a same-source wire; keep, per wire, whichever gives fewer conflicts. */
function arrangeShared(m: EngineModel, paths: Paths, geo: Geometry, initial: Labels, p: Permissions): Labels {
  const branches = copy(paths);
  for (const e of m.edges) {
    if (!editable(e, p)) continue;
    let common = 0;
    for (const other of m.edges) if (other.id !== e.id && source(e) && source(e) === source(other)) common = Math.max(common, commonPrefix(paths[e.id], paths[other.id]));
    if (common > 0) {
      let left = common;
      const ps = paths[e.id];
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1], b = ps[i], length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (left < length - 1e-6) { branches[e.id] = simplify([{ x: a.x + Math.sign(b.x - a.x) * left, y: a.y + Math.sign(b.y - a.y) * left }, ...ps.slice(i)]); break; }
        left -= length;
      }
    }
  }
  const branchLabels = arrangeOnce(m, branches, geo, initial, p), fullLabels = arrangeOnce(m, paths, geo, initial, p);
  let best = labelConflicts(branchLabels, geo) <= labelConflicts(fullLabels, geo) ? branchLabels : fullLabels;
  for (const e of m.edges) {
    if (!editable(e, p)) continue;
    for (const src of [branchLabels, fullLabels]) {
      if (!src[e.id]) continue;
      const proposal = { ...best, [e.id]: src[e.id] };
      if (labelConflicts(proposal, geo) < labelConflicts(best, geo)) best = proposal;
    }
  }
  return best;
}

/** Arrange the labels of a plan; manual marks stay where they are (V2 uiArrangeLabels, L1814 layer). */
export function arrangeLabels(m: EngineModel, paths: Paths, geo: Geometry, initial: Labels, p: Permissions): Labels {
  const labels = copy(initial);
  const edges = m.edges.map(e => {
    const mk = mark(e);
    if (!mk || !labels[e.id]) return e;
    Object.assign(labels[e.id], { x: mk.x, y: mk.y, angle: mk.angle, pinned: true });
    return { ...e, locked: true };
  });
  return arrangeShared({ ...m, edges }, paths, geo, labels, p);
}
