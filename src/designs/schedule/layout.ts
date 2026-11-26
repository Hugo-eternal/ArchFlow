// designs/schedule — the timeline layout. Nothing of it is saved: V3 recomputes every position
// from the task order, the links (a tree: one predecessor per task) and the saved offsets
// (plan §2.3; V2 cached x / y / w / h / baseX / axisX … / graphLane / graphDepth in the file).
//
// V2 (legacy/app.zh-Hant.html): graphStructure L655, axisLayout L685 (lanes and depth: each
// branch after the first opens a new lane; lane bands sized by the tallest card above / below
// the axis) + L722 (axis offsets), scheduleAppearance / scheduleMetrics L719–L721 (card height
// from the font sizes), frameStem L686, graphBounds L689, refs T01… L685.
import type { ScheduleData, Task } from '../../io/schema-types';
import { visibleDates } from './dates';

export const TASK_W = 240;
export const PITCH = 285;          // distance between depths on the axis
export const AXIS_LEFT = 70;       // x of the first card
export const CARD_GAP = 34;        // axis → card edge
export const LANE_GAP = 24;

export interface ScheduleText { title: number; body: number; time: number }

/** Font sizes of the cards and interval labels, bounded as V2 (16 / 11 / 11 by default). */
export function textSizes(d: ScheduleData): ScheduleText {
  const a = d.appearance ?? {};
  const b = (v: unknown, def: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  return { title: b(a.title, 16, 12, 26), body: b(a.body, 11, 10, 18), time: b(a.time, 11, 10, 20) };
}

/** Card sections: header (title), note row, date rows (V2 scheduleMetrics). */
export function cardMetrics(t: Task, s: ScheduleText): { header: number; note: number; date: number; height: number } {
  const header = Math.max(52, Math.ceil(s.title * 1.4) + 26);
  const note = t.note ? Math.ceil(s.body * 1.6) + 6 : 0;
  const dates = visibleDates(t);
  const date = dates.length ? (t.time.type === 'range' ? 2 * (s.body + 7) + 16 : s.body + 27) : 0;
  return { header, note, date, height: header + note + date + 2 };
}

export class ScheduleError extends Error {
  constructor(readonly code: 'endpoint' | 'duplicate' | 'merge' | 'cycle') { super(code); }
}

/** Predecessor / successors of every task; throws on links V2 also refused (merges, cycles). */
export function structure(d: ScheduleData): { children: Map<string, string[]>; parent: Map<string, string>; roots: Task[] } {
  const ids = new Set(d.tasks.map(t => t.id));
  const children = new Map(d.tasks.map(t => [t.id, [] as string[]]));
  const parent = new Map<string, string>(), pairs = new Set<string>();
  for (const l of d.links) {
    if (!ids.has(l.from) || !ids.has(l.to) || l.from === l.to) throw new ScheduleError('endpoint');
    const pair = `${l.from}|${l.to}`;
    if (pairs.has(pair)) throw new ScheduleError('duplicate');
    pairs.add(pair);
    if (parent.has(l.to)) throw new ScheduleError('merge');
    parent.set(l.to, l.from);
    children.get(l.from)!.push(l.to);
  }
  const done = new Set<string>(), active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new ScheduleError('cycle');
    if (done.has(id)) return;
    active.add(id);
    for (const c of children.get(id)!) visit(c);
    active.delete(id);
    done.add(id);
  };
  for (const t of d.tasks) visit(t.id);
  return { children, parent, roots: d.tasks.filter(t => !parent.has(t.id)) };
}

export interface TaskBox {
  id: string;
  /** Display reference: T01, T02 … in task order (V2 rewrote `ref` on every layout). */
  ref: string;
  lane: number; depth: number;
  /** Card rectangle (offset applied). */
  x: number; y: number; w: number; h: number;
  /** Axis point (offset applied). */
  axis: { x: number; y: number };
  metrics: ReturnType<typeof cardMetrics>;
}

export interface ScheduleLayout {
  boxes: Map<string, TaskBox>;
  children: Map<string, string[]>;
  parent: Map<string, string>;
  text: ScheduleText;
}

const offset = (v: number) => (Number.isFinite(v) ? Math.max(-100000, Math.min(100000, v)) : 0);

/** Positions of every card and axis point. */
export function layout(d: ScheduleData): ScheduleLayout {
  const g = structure(d), text = textSizes(d);
  const byId = new Map(d.tasks.map(t => [t.id, t]));
  const placed: { t: Task; lane: number; depth: number }[] = [];
  let lane = 0;
  const place = (id: string, depth: number) => {
    placed.push({ t: byId.get(id)!, lane, depth });
    g.children.get(id)!.forEach((c, i) => { if (i) lane++; place(c, depth + 1); });
  };
  g.roots.forEach((r, i) => { if (i) lane++; place(r.id, 0); });

  const bands = Array.from({ length: lane + 1 }, () => ({ top: 32, bottom: 34 }));
  const metrics = new Map(placed.map(p => [p.t.id, cardMetrics(p.t, text)]));
  for (const p of placed) {
    const b = bands[p.lane], h = metrics.get(p.t.id)!.height;
    if (p.t.side === 'bottom') b.bottom = Math.max(b.bottom, h + CARD_GAP); else b.top = Math.max(b.top, h + CARD_GAP);
  }
  const ys: number[] = [];
  bands.forEach((b, i) => { ys[i] = i ? ys[i - 1] + bands[i - 1].bottom + b.top + LANE_GAP : Math.max(150, b.top + 35); });

  const order = new Map(d.tasks.map((t, i) => [t.id, i]));
  const boxes = new Map<string, TaskBox>();
  for (const p of placed) {
    const t = p.t, m = metrics.get(t.id)!;
    const ax = AXIS_LEFT + p.depth * PITCH + TASK_W / 2 + offset(t.offset.axis.x);
    const ay = ys[p.lane] + offset(t.offset.axis.y);
    const baseY = t.side === 'bottom' ? ay + CARD_GAP : ay - CARD_GAP - m.height;
    boxes.set(t.id, {
      id: t.id, ref: `T${String(order.get(t.id)! + 1).padStart(2, '0')}`, lane: p.lane, depth: p.depth,
      x: ax - TASK_W / 2 + offset(t.offset.card.x), y: baseY + offset(t.offset.card.y), w: TASK_W, h: m.height,
      axis: { x: ax, y: ay }, metrics: m,
    });
  }
  return { boxes, children: g.children, parent: g.parent, text };
}

/** The elbow from an axis point to its card, or null when the point is inside the card (V2 frameStem). */
export function stem(b: TaskBox): string | null {
  const { x: ax, y: ay } = b.axis;
  if (ax >= b.x && ax <= b.x + b.w && ay >= b.y && ay <= b.y + b.h) return null;
  const above = b.y + b.h / 2 < ay;
  const attachX = Math.max(b.x + 12, Math.min(b.x + b.w - 12, ax)), attachY = above ? b.y + b.h : b.y;
  const mid = (ay + attachY) / 2;
  return `M${ax},${ay} V${mid} H${attachX} V${attachY}`;
}

/** Route of a link along the axis: straight, or out 55 px then over to the other lane. */
export function linkRoute(a: TaskBox, b: TaskBox): { d: string; label: { x: number; y: number }; end: { x: number; y: number; dir: 1 | -1 } } {
  const x1 = a.axis.x, y1 = a.axis.y, x2 = b.axis.x, y2 = b.axis.y, dir = x2 >= x1 ? 1 : -1;
  const bend = x1 + 55 * dir;
  const d = y1 === y2 ? `M${x1},${y1} H${x2}` : `M${x1},${y1} H${bend} V${y2} H${x2}`;
  return { d, label: { x: y1 === y2 ? (x1 + x2) / 2 : (bend + x2) / 2, y: y2 }, end: { x: x2, y: y2, dir } };
}

/** Everything drawn, with V2's margins (graphBounds L689). */
export function scheduleBounds(l: ScheduleLayout): { x: number; y: number; w: number; h: number } | null {
  const bs = [...l.boxes.values()];
  if (!bs.length) return null;
  const left = Math.min(...bs.map(b => Math.min(b.x, b.axis.x - 65))) - 30;
  const top = Math.min(...bs.map(b => Math.min(b.y, b.axis.y - 30))) - 30;
  const right = Math.max(...bs.map(b => Math.max(b.x + b.w, b.axis.x + 65))) + 30;
  const bottom = Math.max(...bs.map(b => Math.max(b.y + b.h, b.axis.y + 34))) + 30;
  return { x: left, y: top, w: right - left, h: bottom - top };
}
