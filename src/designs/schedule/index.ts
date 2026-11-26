// designs/schedule — project schedules: tasks on one axis with branches, interval days between
// linked tasks (plan §2.3). 3.28: layout, drawing, the starter template and the module; task /
// interval editing, appearance and export arrive in 3.29.
//
// V2: scheduleExample + the af16 "simple" plan (legacy L3479: anchor 2026-03-10, dates shifted by
// whole weeks to the current week, L3491), render L626 / L691 / L735, drawEdges L688.
import type { ScheduleData, Task } from '../../io/schema-types';
import { DATA_SCHEMAS } from '../../io/schema';
import type { MessageKey } from '../../core/i18n';
import { localize, type DesignModule } from '../module';
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
    render(d, { selected, measure }) {
      try {
        // free text boxes (headings, notes) under the timeline; V2 lost them on reload (KNOWN_LOSS)
        return { node: h('g', {}, [textsLayer(d.texts, { measure }), scheduleLayer(d, layout(d), { selected, measure, canvas: true })]) };
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
  },
};
