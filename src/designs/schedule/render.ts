// designs/schedule — the timeline drawing as SVG VNodes (canvas and, from 3.29, export). Colours
// are design tokens (--sched-*, the V2 "engineering blue" theme); geometry follows V2's
// schedule export (legacy L754), which is also what V2's canvas showed.
//
// V2: drawEdges L688 (links along the axis, arrow, interval label 88 × 28, start / end ticks,
// fork ring, axis dot), themeScheduleEdges L733 (label width from the text), frameStem L686,
// exportSvgDocument L754 (card: title at header/2 + 0.35 em, note at header + 1.15 em, rule
// and date rows), af16 decorate L3396 (status / milestone / issue chips, milestone diamond).
import type { ScheduleData, Task } from '../../io/schema-types';
import { t, type MessageKey } from '../../core/i18n';
import type { Measure } from '../../render/texts';
import { h, r2, type VNode } from '../../render/vnode';
import { formatDate, interval, issues, visibleDates } from './dates';
import { linkRoute, stem, TASK_W, type ScheduleLayout, type TaskBox } from './layout';
import { geometry, lookStyle, themeOf } from './appearance';

const hex = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);

export interface ScheduleRenderOptions {
  selected?: ReadonlySet<string>;
  measure: Measure;
  /** Canvas extras: status / milestone / issue chips and fork labels (V2 exports had none). */
  canvas?: boolean;
  /** Today as a day number (overdue chips); default the real today. */
  today?: number;
}

const ELLIPSIS = '…';

/** Cut a text to fit `max` px with an ellipsis (V2 export text()). */
export function fit(text: string, max: number, size: number, bold: boolean, measure: Measure): string {
  if (!max || measure(text, size, bold, false) <= max) return text;
  let s = text;
  while (s && measure(s + ELLIPSIS, size, bold, false) > max) s = s.slice(0, -1);
  return s + ELLIPSIS;
}

/** Interval label text ("14 days" in English), or '' when there is none. */
export function intervalLabel(d: ScheduleData, linkId: string): string {
  const l = d.links.find(x => x.id === linkId);
  if (!l) return '';
  const r = interval(d, l);
  return r.days === null ? '' : t('schedule.days', { n: r.days });
}

function linksLayer(d: ScheduleData, lay: ScheduleLayout, o: ScheduleRenderOptions): VNode[] {
  const out: VNode[] = [];
  for (const l of d.links) {
    const a = lay.boxes.get(l.from), b = lay.boxes.get(l.to);
    if (!a || !b) continue;
    const r = linkRoute(a, b), cross = a.axis.y !== b.axis.y, sel = o.selected?.has(l.id);
    const cls = `af-sched-link${cross ? ' is-branch' : ''}${sel ? ' is-selected' : ''}`;
    const e = r.end, k = e.dir;
    const label = intervalLabel(d, l.id);
    // a link's own branch colour (V2 L795; otherwise every link uses the theme's line colour)
    const own = hex(l.branchColor), paint = own ? `stroke:${own}` : undefined;
    out.push(h('g', { class: cls, 'data-link': l.id }, [
      h('path', { class: 'af-sched-link-line', d: r.d, style: paint }),
      h('path', { class: 'af-sched-link-arrow', d: `M${e.x - 17 * k},${e.y - 4} L${e.x - 10 * k},${e.y} L${e.x - 17 * k},${e.y + 4}`, style: paint }),
      label ? (() => {
        const size = lay.text.time, w = Math.max(88, label.length * size * 0.65 + 22), hh = Math.max(28, size + 12);
        const ty = r.label.y + 4;
        return h('g', { class: 'af-sched-interval' }, [
          h('rect', { x: r2(r.label.x - w / 2), y: r2(ty - size * 0.35 - hh / 2), width: r2(w), height: hh, rx: 7 }),
          h('text', { x: r2(r.label.x), y: r2(ty), 'text-anchor': 'middle', style: `font-size:${size}px` }, label),
        ]);
      })() : null,
    ]));
  }
  return out;
}

function pointsLayer(d: ScheduleData, lay: ScheduleLayout, o: ScheduleRenderOptions): VNode[] {
  const out: VNode[] = [];
  for (const task of d.tasks) {
    const b = lay.boxes.get(task.id)!, { x, y } = b.axis, kids = lay.children.get(task.id) ?? [];
    const sel = o.selected?.has(task.id), path = stem(b);
    const own = hex(task.branchColor);
    if (path) out.push(h('path', { class: `af-sched-stem${sel ? ' is-selected' : ''}`, 'data-task-stem': task.id, d: path, style: own ? `stroke:${own}` : undefined }));
    if (!lay.parent.has(task.id)) out.push(h('line', { class: 'af-sched-tick', x1: x - 60, y1: y, x2: x - 10, y2: y }));
    if (!kids.length) out.push(h('line', { class: 'af-sched-tick is-open', x1: x + 10, y1: y, x2: x + 55, y2: y }));
    if (kids.length > 1) {
      out.push(h('circle', { class: 'af-sched-fork', cx: x, cy: y, r: 12 }));
      if (o.canvas) out.push(h('text', { class: 'af-sched-fork-label', x: x + 16, y: y + 27 }, t('schedule.fork', { n: kids.length })));
    }
    out.push(h('circle', { class: `af-sched-dot${kids.length > 1 ? ' is-fork' : ''}${sel ? ' is-selected' : ''}`, 'data-task-point': task.id, cx: x, cy: y, r: 7, style: own && !sel ? `fill:${own}` : undefined }));
    if (task.milestone) out.push(h('path', { class: 'af-sched-milestone', d: `M${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}L${x - 9} ${y}Z` }));
  }
  return out;
}

const DATE_KEY: Record<'start' | 'end' | 'deadline', MessageKey> = { start: 'schedule.date.start', end: 'schedule.date.end', deadline: 'schedule.date.deadline' };

function chips(d: ScheduleData, task: Task, b: TaskBox, o: ScheduleRenderOptions): VNode | null {
  const list: { cls: string; text: string }[] = [];
  if (task.milestone) list.push({ cls: 'is-milestone', text: '◆' });
  if (task.status !== 'todo') list.push({ cls: `is-${task.status}`, text: t(`schedule.status.${task.status}` as MessageKey) });
  const iss = issues(d, task, o.today);
  if (iss.length) list.push({ cls: 'is-issue', text: t(iss.some(i => i.kind === 'conflict') ? 'schedule.issue.conflict' : 'schedule.issue.overdue') });
  if (!list.length) return null;
  // right-aligned in the header, last chip at the right edge
  let x = b.x + b.w - 12;
  const y = b.y + 18, nodes: VNode[] = [];
  for (const c of [...list].reverse()) {
    const w = o.measure(c.text, 11, true, false) + 10;
    x -= w;
    nodes.unshift(h('g', { class: `af-sched-chip ${c.cls}` }, [
      h('rect', { x: r2(x), y: y - 9, width: r2(w), height: 18, rx: 4 }),
      h('text', { x: r2(x + w / 2), y: y + 4, 'text-anchor': 'middle' }, c.text),
    ]));
    x -= 4;
  }
  return h('g', { class: 'af-sched-chips' }, nodes);
}

function cardNode(d: ScheduleData, task: Task, b: TaskBox, lay: ScheduleLayout, o: ScheduleRenderOptions): VNode {
  const s = lay.text, m = b.metrics, dates = visibleDates(task);
  const title = task.title || t('schedule.untitled');
  const kids: (VNode | null)[] = [
    h('rect', { class: 'af-sched-card-body', x: r2(b.x), y: r2(b.y), width: TASK_W, height: r2(b.h), rx: geometry(d.appearance).radius }),
    h('text', { class: 'af-sched-title', x: r2(b.x + 13), y: r2(b.y + m.header / 2 + s.title * 0.35), style: `font-size:${s.title}px` }, fit(title, TASK_W - 26, s.title, true, o.measure)),
    task.note ? h('text', { class: 'af-sched-note', x: r2(b.x + 13), y: r2(b.y + m.header + s.body * 1.15), style: `font-size:${s.body}px` }, fit(task.note, TASK_W - 26, s.body, false, o.measure)) : null,
  ];
  if (dates.length) {
    const dy = b.y + m.header + m.note;
    kids.push(h('line', { class: 'af-sched-rule', x1: r2(b.x + 12), y1: r2(dy), x2: r2(b.x + TASK_W - 12), y2: r2(dy) }));
    dates.forEach((dt, row) => {
      const y = dt.key === 'deadline' ? dy + 10 + s.body : dy + 8 + s.body + row * (s.body + 7);
      kids.push(h('text', { class: 'af-sched-date', x: r2(b.x + 13), y: r2(y), style: `font-size:${s.body}px` }, `${t(DATE_KEY[dt.key])}  ${formatDate(dt.date)}`));
    });
  }
  if (o.canvas) kids.push(chips(d, task, b, o));
  if (o.selected?.has(task.id)) kids.push(h('rect', { class: 'af-sched-selection', x: r2(b.x - 4), y: r2(b.y - 4), width: TASK_W + 8, height: r2(b.h + 8), rx: 7 }));
  const style = task.branchColor && /^#[0-9a-f]{6}$/i.test(task.branchColor) ? `--sched-border:${task.branchColor};--sched-accent:${task.branchColor}` : undefined;
  return h('g', { class: `af-sched-card is-${task.status}${task.milestone ? ' is-milestone' : ''}`, 'data-task': task.id, style }, kids);
}

/** The whole timeline: links, axis points, then cards on top (V2 export order). */
export function scheduleLayer(d: ScheduleData, lay: ScheduleLayout, o: ScheduleRenderOptions): VNode {
  return h('g', { class: 'af-schedule', 'data-sched-theme': themeOf(d.appearance), style: lookStyle(d.appearance) }, [
    h('g', { class: 'af-sched-axis' }, [...linksLayer(d, lay, o), ...pointsLayer(d, lay, o)]),
    ...d.tasks.map(task => cardNode(d, task, lay.boxes.get(task.id)!, lay, o)),
  ]);
}
