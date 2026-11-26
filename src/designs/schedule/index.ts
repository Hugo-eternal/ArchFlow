// designs/schedule — project schedules: tasks on one axis with branches, interval days between
// linked tasks (plan §2.3). 3.28: layout, drawing, the starter template and the module; task /
// interval editing, appearance and export arrive in 3.29.
//
// V2: scheduleExample + the af16 "simple" plan (legacy L3479: anchor 2026-03-10, dates shifted by
// whole weeks to the current week, L3491), render L626 / L691 / L735, drawEdges L688.
import type { ScheduleData, Task } from '../../io/schema-types';
import { DATA_SCHEMAS } from '../../io/schema';
import { t, type MessageKey } from '../../core/i18n';
import type { Command } from '../../core/commands';
import { localize, type CanvasSelection, type DesignCommandContext, type DesignModule } from '../module';
import { addBranch, appendTask, drag, nudge, removeItems, resetOffsets, ScheduleEditError, type DragHandle } from './edit';
import { scheduleFields } from './fields';
import { day, today } from './dates';
import { layout, scheduleBounds, ScheduleError } from './layout';
import { scheduleLayer } from './render';
import { estimateWidth, textLayout, textsLayer } from '../../render/texts';
import { h } from '../../render/vnode';
import starter from './templates/starter.json';

const TEMPLATES = { starter } as const;

export function emptySchedule(): ScheduleData {
  return { tasks: [], links: [], texts: [], rules: { endpoint: 'start', count: 'difference' }, appearance: {}, snap: { enabled: true, range: 12 } };
}

const iso = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

/** Move every task date by whole weeks so `anchor` lands in the current week (V2 L3491). */
export function shiftToWeek(d: ScheduleData, anchor: string, now: number = today()): ScheduleData {
  const a = day(anchor);
  if (a === null) return d;
  const shift = Math.round((now - a) / 7) * 7;
  const mv = (s: string) => { const n = day(s); return n === null ? s : iso(n + shift); };
  const time = (tm: Task['time']): Task['time'] =>
    tm.type === 'range' ? { type: 'range', start: mv(tm.start), end: mv(tm.end) } : tm.type === 'deadline' ? { type: 'deadline', date: mv(tm.date) } : tm;
  return { ...d, tasks: d.tasks.map(t => ({ ...t, time: time(t.time) })) };
}

const isSchedule = (c: DesignCommandContext) => c.store.activeDesign?.type === 'schedule';
const selectedTask = (c: DesignCommandContext) => {
  const s = c.store.selection as CanvasSelection | null;
  return s?.kind === 'task' && (c.store.data(c.store.activeDesignId) as ScheduleData).tasks.some(x => x.id === s.id) ? s.id : undefined;
};

/** Toolbar commands (V2 schedule chrome: add task, add branch, re-arrange L661–L663 / L727). */
function scheduleCommands(): Command<DesignCommandContext>[] {
  const added = (c: DesignCommandContext, id: string) => { c.selectItem({ kind: 'task', id }); c.fitView(); };
  return [
    {
      id: 'schedule.append', label: 'cmd.scheduleAppend', group: 'schedule', enabled: isSchedule,
      run: c => { let id = ''; if (c.editDesign(d => { const r = appendTask(d as ScheduleData, t('schedule.task.newTitle'), selectedTask(c)); id = r.id; return r.data; })) added(c, id); },
    },
    {
      id: 'schedule.addBranch', label: 'cmd.scheduleBranch', group: 'schedule', enabled: c => isSchedule(c) && !!selectedTask(c),
      run: c => {
        const parent = selectedTask(c)!;
        let id = '';
        if (c.editDesign(d => { const r = addBranch(d as ScheduleData, parent, { main: t('schedule.task.mainTitle'), branch: t('schedule.task.branchTitle') }); id = r.id; return r.data; })) added(c, id);
      },
    },
    {
      id: 'schedule.autoArrange', label: 'cmd.scheduleArrange', group: 'schedule', enabled: isSchedule,
      run: c => { if (c.editDesign(d => resetOffsets(d as ScheduleData))) { c.fitView(); c.notify('schedule.arranged'); } },
    },
  ];
}

export const scheduleDesign: DesignModule<ScheduleData> = {
  type: 'schedule',
  label: 'design.type.schedule',
  schema: DATA_SCHEMAS.schedule,
  templates: [{ id: 'starter', label: 'template.schedule.starter.label' }],
  editor: 'canvas',
  create({ template } = {}) {
    if (!template) return { name: '', data: emptySchedule() };
    const tpl = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!tpl) throw new Error(`unknown schedule template ${template}`);
    const out = localize(tpl) as unknown as { name: string; anchor: string; camera: { x: number; y: number; z: number }; data: ScheduleData };
    return { name: out.name, data: shiftToWeek(out.data, out.anchor), camera: out.camera };
  },
  canvas: {
    label: 'schedule.canvas.label',
    render(d, { selected, measure, guides, forExport }) {
      try {
        const lay = layout(d), b = scheduleBounds(lay);
        // snap guides across the drawing while an axis point is dragged (V2 schedule-snap-guide)
        const lines = b && guides && !forExport ? [
          guides.x !== null ? h('line', { class: 'af-sched-guide', x1: guides.x, y1: b.y, x2: guides.x, y2: b.y + b.h }) : null,
          guides.y !== null ? h('line', { class: 'af-sched-guide', x1: b.x, y1: guides.y, x2: b.x + b.w, y2: guides.y }) : null,
        ] : [];
        // free text boxes (headings, notes) under the timeline; V2 lost them on reload (KNOWN_LOSS)
        return { node: h('g', {}, [textsLayer(d.texts, { measure }), scheduleLayer(d, lay, { selected: forExport ? undefined : selected, measure, canvas: !forExport }), ...lines]) };
      } catch (e) {
        if (e instanceof ScheduleError) return { node: null, error: `schedule.error.${e.code}` as MessageKey };
        throw e;
      }
    },
    bounds(d) {
      let tl: ReturnType<typeof scheduleBounds> = null;
      try { tl = scheduleBounds(layout(d)); } catch (e) { if (!(e instanceof ScheduleError)) throw e; }
      const rects = [...(tl ? [tl] : []), ...d.texts.map(x => ({ x: x.x, y: x.y, w: x.w, h: textLayout(x, estimateWidth).height }))];
      if (!rects.length) return null;
      const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
      return { x, y, w: Math.max(...rects.map(r => r.x + r.w)) - x, h: Math.max(...rects.map(r => r.y + r.h)) - y };
    },
    target(a) {
      if (a.taskPoint) return { sel: { kind: 'task', id: a.taskPoint }, handle: 'axis' };
      if (a.task) return { sel: { kind: 'task', id: a.task }, handle: 'card' };
      if (a.link) return { sel: { kind: 'link', id: a.link } };
      return null;
    },
    drag: (start, sel, handle, dx, dy, mods) => (sel.kind === 'task' ? drag(start, sel.id, handle as DragHandle, dx, dy, mods) : { data: start }),
    nudge: (d, sel, dx, dy) => (sel.kind === 'task' ? nudge(d, sel.id, dx, dy) : d),
    remove: (d, sel) => (sel.kind === 'task' || sel.kind === 'link' ? removeItems(d, [{ kind: sel.kind, id: sel.id }]) : d),
    exists: (d, sel) => (sel.kind === 'task' ? d.tasks.some(x => x.id === sel.id) : sel.kind === 'link' ? d.links.some(x => x.id === sel.id) : true),
    fields: scheduleFields,
    refusal: e => (e instanceof ScheduleEditError || e instanceof ScheduleError ? `schedule.error.${e.code}` as MessageKey : null),
  },
  commands: scheduleCommands(),
};
