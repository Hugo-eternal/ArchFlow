// designs/schedule — pure edits of a schedule (each returns new data; the shell commits it as one
// undo step). V2 (legacy/app.zh-Hant.html): graphCreateTask / graphAppend / graphBranch L659–L662,
// graphSetParent L672, removeSelection L674 (a removed task's successors become new roots),
// beginFrameMove L690 (card offset), beginAxisMove L723 (axis offset, snapping to other points),
// arrow-key nudges L733, frameOffset (±100000).
import type { Link, ScheduleData, Task, TaskTime } from '../../io/schema-types';
import { uid } from '../../core/ids';
import { layout, structure, ScheduleError } from './layout';

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

/** A new task after `parent` (default: the last task without successors), V2 graphAppend. */
export function appendTask(d: ScheduleData, title: string, parent?: string): { data: ScheduleData; id: string } {
  if (d.tasks.length >= MAX_TASKS) throw new ScheduleEditError('limit');
  const g = structure(d);
  const p = parent ?? [...d.tasks].reverse().find(t => !g.children.get(t.id)!.length)?.id;
  const t = makeTask(title);
  return { data: { ...d, tasks: [...d.tasks, t], links: p ? [...d.links, linkTo(p, t.id)] : d.links }, id: t.id };
}

/**
 * A branch from `parent` (V2 graphBranch): when the parent has no successor yet, first a
 * main-line successor, then the branch — so a branch always sits beside a main line.
 */
export function addBranch(d: ScheduleData, parent: string, titles: { main: string; branch: string }): { data: ScheduleData; id: string } {
  const kids = structure(d).children.get(parent);
  if (!kids) throw new ScheduleEditError('noSelection');
  if (d.tasks.length + (kids.length ? 1 : 2) > MAX_TASKS) throw new ScheduleEditError('limit');
  let data = d;
  if (!kids.length) data = appendTask(data, titles.main, parent).data;
  return appendTask(data, titles.branch, parent);
}

/** Remove tasks / links; links of a removed task go too, its successors become roots (V2 L674). */
export function removeItems(d: ScheduleData, items: { kind: 'task' | 'link'; id: string }[]): ScheduleData {
  const tasks = new Set(items.filter(i => i.kind === 'task').map(i => i.id)), links = new Set(items.filter(i => i.kind === 'link').map(i => i.id));
  return {
    ...d,
    tasks: d.tasks.filter(t => !tasks.has(t.id)),
    links: d.links.filter(l => !links.has(l.id) && !tasks.has(l.from) && !tasks.has(l.to)),
  };
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
