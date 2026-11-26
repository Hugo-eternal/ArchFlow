// designs/schedule — pure edits of a schedule (each returns new data; the shell commits it as one
// undo step). V2 (legacy/app.zh-Hant.html): graphCreateTask / graphAppend / graphBranch L659–L662
// with the af16 layer L3582–L3598 (insert after the selected task, fillDefaults L3567) and the
// branch colour of the parent (L800), graphSetParent L672, removeSelection L772 (a removed task's
// successors are linked to its predecessor), af16 fixConflicts L3601–L3606,
// beginFrameMove L690 (card offset), beginAxisMove L723 (axis offset, snapping to other points),
// arrow-key nudges L733, frameOffset (±100000).
import type { Link, ScheduleData, Task, TaskTime } from '../../io/schema-types';
import { uid } from '../../core/ids';
import { layout, structure, ScheduleError } from './layout';
import { durationOf, iso, spanOf, today, weekday } from './dates';

export const MAX_TASKS = 100;
export const OFFSET_LIMIT = 100000;

export class ScheduleEditError extends Error {
  constructor(readonly code: 'limit' | 'noSelection' | 'loop') { super(code); }
}

const clampOffset = (v: number) => (Number.isFinite(v) ? Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(v * 100) / 100)) : 0);

export function makeTask(title: string): Task {
  return { id: uid(), title, ref: '', note: '', side: 'top', time: { type: 'none' }, status: 'todo', milestone: false, offset: { card: { x: 0, y: 0 }, axis: { x: 0, y: 0 } } };
}

const linkTo = (from: string, to: string): Link => ({ id: uid(), from, to, days: { mode: 'auto' } });

/** Options of a new task: today (for its default dates) and its title base. */
export interface NewTaskOptions { now?: number }

/** A title not used by another task: base, "base 2", "base 3" … (V2 fillDefaults). */
function uniqueTitle(d: ScheduleData, base: string): string {
  const used = new Set(d.tasks.map(x => x.title));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/**
 * A new task's defaults (V2 af16 fillDefaults): a date range starting the weekday after its
 * predecessor ends (else today), as long as the predecessor (else 5 days); the predecessor's
 * branch colour (V2 L800).
 */
function newTask(d: ScheduleData, title: string, parent: Task | undefined, now: number): Task {
  const end = parent ? spanOf(parent).end : null;
  const start = weekday(end !== null ? end + 1 : now), len = (parent && durationOf(parent)) || 5;
  const t = makeTask(uniqueTitle(d, title));
  t.time = { type: 'range', start: iso(start), end: iso(start + len - 1) };
  if (parent?.branchColor) t.branchColor = parent.branchColor;
  return t;
}

const linkFrom = (parent: Task, to: string): Link => ({ ...linkTo(parent.id, to), ...(parent.branchColor ? { branchColor: parent.branchColor } : {}) });

/**
 * "Continue" (V2 graphAppend + af16): a new task after `parent` (default: the last task without
 * successors). When the parent had exactly one successor, that successor now follows the new task
 * (the new task is inserted, not a branch).
 */
export function appendTask(d: ScheduleData, title: string, parent?: string, opts: NewTaskOptions = {}): { data: ScheduleData; id: string; inserted: boolean } {
  if (d.tasks.length >= MAX_TASKS) throw new ScheduleEditError('limit');
  const g = structure(d);
  const p = d.tasks.find(x => x.id === (parent ?? [...d.tasks].reverse().find(t => !g.children.get(t.id)!.length)?.id));
  const t = newTask(d, title, p, opts.now ?? today());
  let links = d.links, inserted = false;
  if (p && parent) {
    const kids = g.children.get(p.id)!;
    if (kids.length === 1) {
      links = links.map(l => (l.from === p.id && l.to === kids[0] ? { ...l, from: t.id } : l));
      inserted = true;
    }
  }
  return { data: { ...d, tasks: [...d.tasks, t], links: p ? [...links, linkFrom(p, t.id)] : links }, id: t.id, inserted };
}

/**
 * A branch from `parent` (V2 graphBranch): when the parent has no successor yet, first a
 * main-line successor, then the branch — so a branch always sits beside a main line. Both get
 * the new-task defaults.
 */
export function addBranch(d: ScheduleData, parent: string, titles: { main: string; branch: string }, opts: NewTaskOptions = {}): { data: ScheduleData; id: string } {
  const kids = structure(d).children.get(parent);
  if (!kids) throw new ScheduleEditError('noSelection');
  if (d.tasks.length + (kids.length ? 1 : 2) > MAX_TASKS) throw new ScheduleEditError('limit');
  const p = d.tasks.find(x => x.id === parent)!, now = opts.now ?? today();
  let data = d;
  if (!kids.length) { const main = newTask(data, titles.main, p, now); data = { ...data, tasks: [...data.tasks, main], links: [...data.links, linkFrom(p, main.id)] }; }
  const b = newTask(data, titles.branch, p, now);
  return { data: { ...data, tasks: [...data.tasks, b], links: [...data.links, linkFrom(p, b.id)] }, id: b.id };
}

/**
 * Remove tasks / links (V2 removeSelection L772): a removed task's successors are linked to its
 * predecessor (with automatic days), or become starts when it had none.
 */
export function removeItems(d: ScheduleData, items: { kind: 'task' | 'link'; id: string }[]): ScheduleData {
  let data: ScheduleData = { ...d, links: d.links.filter(l => !items.some(i => i.kind === 'link' && i.id === l.id)) };
  for (const it of items) {
    if (it.kind !== 'task' || !data.tasks.some(t => t.id === it.id)) continue;
    const parent = data.links.find(l => l.to === it.id)?.from, kids = data.links.filter(l => l.from === it.id).map(l => l.to);
    const p = parent ? data.tasks.find(t => t.id === parent) : undefined;
    data = {
      ...data,
      tasks: data.tasks.filter(t => t.id !== it.id),
      links: [...data.links.filter(l => l.from !== it.id && l.to !== it.id), ...(p ? kids.map(k => linkFrom(p, k)) : [])],
    };
  }
  return data;
}

/** A task with no dates gets a range after its predecessor (V2 af16 "Set a date range"). */
export function setDefaultRange(d: ScheduleData, id: string, now = today()): ScheduleData {
  const t = d.tasks.find(x => x.id === id);
  if (!t || t.time.type !== 'none') return d;
  const parent = d.tasks.find(x => x.id === d.links.find(l => l.to === id)?.from);
  return updateTask(d, id, { time: newTask(d, t.title, parent, now).time });
}

/** A range's length in days, both ends counted (V2 af16 duration field): moves the end date. */
export function setDuration(d: ScheduleData, id: string, days: number): ScheduleData {
  const t = d.tasks.find(x => x.id === id), start = t ? spanOf(t).start : null;
  if (!t || t.time.type !== 'range' || start === null) return d;
  const n = Math.max(1, Math.min(999, Math.round(days) || 1));
  return updateTask(d, id, { time: { ...t.time, end: iso(start + n - 1) } });
}

/** Successors that start on or before their predecessor's end, below `from` (V2 conflictsBelow). */
export function conflictsBelow(d: ScheduleData, from?: string): number {
  return shiftConflicts(d, from).moved;
}

/**
 * Push following tasks out of date conflicts (V2 af16 fixConflicts): walking down from `from`'s
 * predecessor (or every start), a successor that starts on or before its predecessor's end moves,
 * with everything after it, to the next weekday; durations stay. Returns how many chains moved.
 */
export function shiftConflicts(d: ScheduleData, from?: string): { data: ScheduleData; moved: number } {
  const tasks = new Map(d.tasks.map(t => [t.id, { ...t }]));
  const kids = (id: string) => d.links.filter(l => l.from === id).map(l => l.to);
  const shift = (t: Task, delta: number): Task => {
    if (t.time.type === 'range') return { ...t, time: { ...t.time, start: iso(spanOf(t).start! + delta), end: iso(spanOf(t).end! + delta) } };
    if (t.time.type === 'deadline' && spanOf(t).end !== null) return { ...t, time: { ...t.time, date: iso(spanOf(t).end! + delta) } };
    return t;
  };
  const shiftTree = (id: string, delta: number, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id);
    tasks.set(id, shift(tasks.get(id)!, delta));
    for (const k of kids(id)) shiftTree(k, delta, seen);
  };
  let moved = 0;
  const walk = (id: string) => {
    const pe = spanOf(tasks.get(id)!).end;
    for (const k of kids(id)) {
      const c = tasks.get(k)!, sp = spanOf(c), cs = sp.start ?? (c.time.type === 'deadline' ? sp.end : null);
      if (pe !== null && cs !== null && cs <= pe) { shiftTree(k, weekday(pe + 1) - cs); moved++; }
      walk(k);
    }
  };
  const parentOf = (id: string) => d.links.find(l => l.to === id)?.from;
  if (from) walk(parentOf(from) ?? from);
  else for (const t of d.tasks) if (!parentOf(t.id)) walk(t.id);
  return { data: moved ? { ...d, tasks: d.tasks.map(t => tasks.get(t.id)!) } : d, moved };
}

/** Tasks after `id` (successors, recursively). */
export function descendants(d: ScheduleData, id: string): Set<string> {
  const out = new Set<string>(), queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const l of d.links) if (l.from === cur && !out.has(l.to)) { out.add(l.to); queue.push(l.to); }
  }
  return out;
}

/** Change a task's predecessor ('' = none), keeping the link (and its days) when unchanged (V2 L672). */
export function setParent(d: ScheduleData, id: string, parent: string): ScheduleData {
  if (parent && (parent === id || descendants(d, id).has(parent))) throw new ScheduleEditError('loop');
  const old = d.links.find(l => l.to === id);
  if ((old?.from ?? '') === parent) return d;
  const links = d.links.filter(l => l.to !== id);
  if (parent) links.push(old?.from === parent ? old : linkTo(parent, id));
  const out = { ...d, links };
  structure(out); // throws ScheduleError on anything V2 refused
  return out;
}

export function updateTask(d: ScheduleData, id: string, patch: Partial<Omit<Task, 'id'>>): ScheduleData {
  return { ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) };
}

export function updateLink(d: ScheduleData, id: string, patch: Partial<Omit<Link, 'id' | 'from' | 'to'>>): ScheduleData {
  return { ...d, links: d.links.map(l => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Change the kind of time, keeping what can be kept (a range's end becomes the deadline and back). */
export function setTimeType(t: Task, type: TaskTime['type']): TaskTime {
  const cur = t.time;
  if (type === cur.type) return cur;
  if (type === 'none') return { type: 'none' };
  if (type === 'deadline') return { type: 'deadline', date: cur.type === 'range' ? cur.end : '' };
  return { type: 'range', start: '', end: cur.type === 'deadline' ? cur.date : '' };
}

// ---------------------------------------------------------------- dragging

export type DragHandle = 'card' | 'axis';
export interface DragMods { shift: boolean; alt: boolean; zoom: number }
export interface DragResult { data: ScheduleData; guides: { x: number | null; y: number | null } }

/**
 * A card or axis point moved by (dx, dy) diagram px from `start`. Axis points snap to other points
 * within `snap.range` screen px (connected tasks first); Shift keeps to the main direction; Alt
 * turns snapping off (V2 beginAxisMove). Cards move freely (V2 beginFrameMove).
 */
export function drag(start: ScheduleData, id: string, handle: DragHandle, dx: number, dy: number, mods: DragMods): DragResult {
  const t = start.tasks.find(x => x.id === id);
  if (!t) return { data: start, guides: { x: null, y: null } };
  if (handle === 'card') {
    const card = { x: clampOffset(t.offset.card.x + dx), y: clampOffset(t.offset.card.y + dy) };
    return { data: updateTask(start, id, { offset: { ...t.offset, card } }), guides: { x: null, y: null } };
  }
  let allowX = true, allowY = true;
  if (mods.shift) { if (Math.abs(dx) >= Math.abs(dy)) { dy = 0; allowY = false; } else { dx = 0; allowX = false; } }
  let lay;
  try { lay = layout(start); } catch (e) { if (e instanceof ScheduleError) return { data: start, guides: { x: null, y: null } }; throw e; }
  const me = lay.boxes.get(id)!;
  let x = me.axis.x + dx, y = me.axis.y + dy;
  const guides = { x: null as number | null, y: null as number | null };
  const range = Math.max(0, Math.min(50, start.snap.range));
  if (start.snap.enabled && !mods.alt && range > 0) {
    const limit = range / Math.max(mods.zoom, 0.01);
    const linked = new Set(start.links.flatMap(l => (l.from === id ? [l.to] : l.to === id ? [l.from] : [])));
    const others = [...lay.boxes.values()].filter(b => b.id !== id);
    let bestX = limit + 0.001, bestY = limit + 0.001;
    for (const pool of [others.filter(b => linked.has(b.id)), others]) for (const o of pool) {
      const ddx = Math.abs(o.axis.x - x), ddy = Math.abs(o.axis.y - y);
      if (allowX && ddx < bestX) { bestX = ddx; guides.x = o.axis.x; }
      if (allowY && ddy < bestY) { bestY = ddy; guides.y = o.axis.y; }
    }
    if (guides.x !== null) x = guides.x;
    if (guides.y !== null) y = guides.y;
  }
  const axis = { x: clampOffset(t.offset.axis.x + x - me.axis.x), y: clampOffset(t.offset.axis.y + y - me.axis.y) };
  return { data: updateTask(start, id, { offset: { ...t.offset, axis } }), guides };
}

/** Arrow keys: move the selected task's axis point by 1 px (10 with Shift), V2 L733. */
export function nudge(d: ScheduleData, id: string, dx: number, dy: number): ScheduleData {
  const t = d.tasks.find(x => x.id === id);
  if (!t) return d;
  return updateTask(d, id, { offset: { ...t.offset, axis: { x: clampOffset(t.offset.axis.x + dx), y: clampOffset(t.offset.axis.y + dy) } } });
}

/** "Re-arrange": clear every card and axis offset (V2 graphAutoFit L727). */
export function resetOffsets(d: ScheduleData): ScheduleData {
  return { ...d, tasks: d.tasks.map(t => ({ ...t, offset: { card: { x: 0, y: 0 }, axis: { x: 0, y: 0 } } })) };
}
