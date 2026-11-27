// designs/schedule — properties panel. Task: name, note, above / below the axis, time (none /
// range / deadline), status, milestone, predecessor, branch colour, card position; link: auto /
// manual days, which dates are compared, colour; nothing selected: counting rules, appearance
// (theme, font sizes, custom look) and axis-point snapping.
//
// V2 (legacy/app.zh-Hant.html): task / link panels L631 / L673 / L741 (quiet panel), inline days
// L647, card position L693, af16 status / milestone / duration L3413–L3424, branch colour L797,
// appearance region L768–L792 / L816, snapping L2349.
import type { ScheduleAppearance, ScheduleCustomLook, ScheduleData, ScheduleTheme, Task } from '../../io/schema-types';
import { t, type MessageKey } from '../../core/i18n';
import type { FieldSpec } from '../../inspector/fields';
import type { CanvasSelection } from '../module';
import { day, durationOf, formatDate, interval, issues, iso, spanOf, today, type Issue } from './dates';
import { conflictsBelow, descendants, setDefaultRange, setDuration, setParent, setTimeType, shiftConflicts, updateLink, updateTask, MAX_TASKS } from './edit';
import { customOf, geometry, setBranchColor, setCustom, setSizes, setTheme, THEME_SWATCH, THEMES, themeOf, useCustom } from './appearance';
import { textSizes } from './layout';

type F = FieldSpec<ScheduleData, CanvasSelection>;
const opts = <V extends string>(prefix: string, values: readonly V[]) => values.map(value => ({ value, label: `${prefix}.${value}` as MessageKey }));

const task = (d: ScheduleData, s: CanvasSelection): Task => {
  const x = d.tasks.find(v => v.id === s.id);
  if (!x) throw new Error(`no task ${s.id}`);
  return x;
};
const link = (d: ScheduleData, s: CanvasSelection) => {
  const x = d.links.find(v => v.id === s.id);
  if (!x) throw new Error(`no link ${s.id}`);
  return x;
};
const validDate = (v: string): MessageKey | null => (v === '' || day(v) !== null ? null : 'schedule.error.date');

/** A button that applies one edit (V2 af16 quick fixes). */
const action = (key: string, text: (d: ScheduleData, s: CanvasSelection) => string, edit: (d: ScheduleData, s: CanvasSelection) => ScheduleData, cls = 'af-field-action'): F => ({
  kind: 'custom', key, label: 'schedule.note', visible: (d, s) => !!text(d, s),
  render: ({ doc, data, sel, apply }) => {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = text(data, sel);
    b.addEventListener('click', () => apply(dd => edit(dd, sel)));
    return b;
  },
});

/** A read-only line of text in the panel. */
const note = (key: string, text: (d: ScheduleData, s: CanvasSelection) => string, cls = 'af-field-note'): F => ({
  kind: 'custom', key, label: 'schedule.note', visible: (d, s) => !!text(d, s),
  render: ({ doc, data, sel }) => { const p = doc.createElement('p'); p.className = cls; p.textContent = text(data, sel); return p; },
});

function taskFields(d: ScheduleData, s: CanvasSelection): F[] {
  const me = d.tasks.find(x => x.id === s.id);
  const after = me ? descendants(d, me.id) : new Set<string>();
  const parents = d.tasks.filter(x => x.id !== s.id && !after.has(x.id));
  const time = (dd: ScheduleData, ss: CanvasSelection) => task(dd, ss).time;
  return [
    { kind: 'text', key: 'title', label: 'schedule.task.title', maxLength: 200, get: (dd, ss) => task(dd, ss).title, set: (dd, ss, v) => updateTask(dd, ss.id, { title: v }) },
    { kind: 'text', key: 'note', label: 'schedule.task.note', maxLength: 200, get: (dd, ss) => task(dd, ss).note, set: (dd, ss, v) => updateTask(dd, ss.id, { note: v }) },
    { kind: 'segmented', key: 'side', label: 'schedule.task.side', options: opts('schedule.side', ['top', 'bottom'] as const), get: (dd, ss) => task(dd, ss).side, set: (dd, ss, v) => updateTask(dd, ss.id, { side: v as Task['side'] }) },
    {
      kind: 'group', key: 'time', label: 'schedule.group.time', open: true, fields: [
        { kind: 'segmented', key: 'timeType', label: 'schedule.task.timeType', options: opts('schedule.time', ['none', 'range', 'deadline'] as const), get: (dd, ss) => time(dd, ss).type, set: (dd, ss, v) => updateTask(dd, ss.id, { time: setTimeType(task(dd, ss), v as Task['time']['type']) }) },
        {
          kind: 'text', inputType: 'date', key: 'start', label: 'schedule.date.start', visible: (dd, ss) => time(dd, ss).type === 'range', validate: validDate,
          get: (dd, ss) => { const x = time(dd, ss); return x.type === 'range' ? x.start : ''; },
          set: (dd, ss, v) => { const x = time(dd, ss); return x.type === 'range' ? updateTask(dd, ss.id, { time: { ...x, start: v } }) : dd; },
        },
        {
          kind: 'text', inputType: 'date', key: 'end', label: 'schedule.date.end', visible: (dd, ss) => time(dd, ss).type === 'range', validate: validDate,
          get: (dd, ss) => { const x = time(dd, ss); return x.type === 'range' ? x.end : ''; },
          set: (dd, ss, v) => { const x = time(dd, ss); return x.type === 'range' ? updateTask(dd, ss.id, { time: { ...x, end: v } }) : dd; },
        },
        {
          kind: 'text', inputType: 'date', key: 'deadline', label: 'schedule.date.deadline', visible: (dd, ss) => time(dd, ss).type === 'deadline', validate: validDate,
          get: (dd, ss) => { const x = time(dd, ss); return x.type === 'deadline' ? x.date : ''; },
          set: (dd, ss, v) => updateTask(dd, ss.id, { time: { type: 'deadline', date: v } }),
        },
        // no dates yet: one button (V2 af16 "Set a date range")
        action('setDates', (dd, ss) => (time(dd, ss).type === 'none' ? t('schedule.task.setDates') : ''), (dd, ss) => setDefaultRange(dd, ss.id)),
        // duration next to the dates, both ends counted; changing it moves the end date (V2 af16)
        {
          kind: 'number', key: 'duration', label: 'schedule.task.duration', unit: t('schedule.unit.days'), min: 1, max: 999, step: 1,
          visible: (dd, ss) => durationOf(task(dd, ss)) !== null,
          get: (dd, ss) => durationOf(task(dd, ss)) ?? 1, set: (dd, ss, v) => setDuration(dd, ss.id, v),
        },
        note('issues', (dd, ss) => issues(dd, task(dd, ss)).map(issueText).join('\n'), 'af-field-note is-warning'),
      ],
    },
    {
      kind: 'group', key: 'progress', label: 'schedule.group.progress', open: true, fields: [
        { kind: 'segmented', key: 'status', label: 'schedule.task.status', options: opts('schedule.status', ['todo', 'doing', 'done'] as const), get: (dd, ss) => task(dd, ss).status, set: (dd, ss, v) => updateTask(dd, ss.id, { status: v as Task['status'] }) },
        { kind: 'toggle', key: 'milestone', label: 'schedule.task.milestone', get: (dd, ss) => task(dd, ss).milestone, set: (dd, ss, v) => updateTask(dd, ss.id, { milestone: v }) },
        // date conflicts around this task: shift the following tasks, durations unchanged (V2 af16 fixConflicts)
        action('fix', (dd, ss) => (conflictsBelow(dd, ss.id) ? t('schedule.fix.task') : ''), (dd, ss) => shiftConflicts(dd, ss.id).data, 'af-field-action is-warning'),
      ],
    },
    {
      kind: 'group', key: 'branch', label: 'schedule.group.branch', fields: [
        {
          kind: 'select', key: 'parent', label: 'schedule.task.parent',
          options: [{ value: '', label: 'schedule.task.noParent' }, ...parents.map(p => ({ value: p.id, label: 'schedule.untitled' as MessageKey, text: p.title || t('schedule.untitled') }))],
          get: (dd, ss) => dd.links.find(l => l.to === ss.id)?.from ?? '',
          set: (dd, ss, v) => setParent(dd, ss.id, v),
        },
        {
          kind: 'color', key: 'branchColor', label: 'schedule.task.branchColor', hint: 'schedule.task.branchColorHint', emptyLabel: 'schedule.color.default',
          fallback: '#245b88', get: (dd, ss) => task(dd, ss).branchColor ?? '',
          set: (dd, ss, v) => setBranchColor(dd, ss.id, v || null, descendants(dd, ss.id)),
        },
        {
          kind: 'custom', key: 'resetCard', label: 'schedule.task.resetCard',
          render: ({ doc, apply, data, sel }) => {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = 'af-field-reset';
            b.textContent = t('schedule.task.resetCard');
            const o = task(data, sel).offset;
            b.disabled = !o.card.x && !o.card.y && !o.axis.x && !o.axis.y;
            b.addEventListener('click', () => apply(dd => updateTask(dd, sel.id, { offset: { card: { x: 0, y: 0 }, axis: { x: 0, y: 0 } } })));
            return b;
          },
        },
      ],
    },
  ];
}

function linkFields(): F[] {
  return [
    note('route', (d, s) => {
      const l = link(d, s), a = d.tasks.find(x => x.id === l.from), b = d.tasks.find(x => x.id === l.to);
      return `${a?.title || t('schedule.untitled')} → ${b?.title || t('schedule.untitled')}`;
    }),
    {
      kind: 'segmented', key: 'mode', label: 'schedule.link.mode', options: opts('schedule.link.mode', ['auto', 'manual'] as const),
      get: (d, s) => link(d, s).days.mode,
      set: (d, s, v) => updateLink(d, s.id, { days: v === 'manual' ? { mode: 'manual', value: interval(d, link(d, s)).days ?? 0 } : { mode: 'auto' } }),
    },
    {
      kind: 'number', key: 'days', label: 'schedule.link.days', unit: t('schedule.unit.days'), min: 0, max: 999999, step: 1, visible: (d, s) => link(d, s).days.mode === 'manual',
      get: (d, s) => { const x = link(d, s).days; return x.mode === 'manual' ? x.value : 0; },
      set: (d, s, v) => updateLink(d, s.id, { days: { mode: 'manual', value: Math.round(v) } }),
    },
    {
      kind: 'segmented', key: 'fromDate', label: 'schedule.link.fromDate', options: opts('schedule.endpoint', ['start', 'end'] as const),
      visible: (d, s) => link(d, s).days.mode === 'auto' && d.tasks.find(x => x.id === link(d, s).from)?.time.type === 'range',
      get: (d, s) => link(d, s).fromDate ?? d.rules.endpoint, set: (d, s, v) => updateLink(d, s.id, { fromDate: v as 'start' | 'end' }),
    },
    {
      kind: 'segmented', key: 'toDate', label: 'schedule.link.toDate', options: opts('schedule.endpoint', ['start', 'end'] as const),
      visible: (d, s) => link(d, s).days.mode === 'auto' && d.tasks.find(x => x.id === link(d, s).to)?.time.type === 'range',
      get: (d, s) => link(d, s).toDate ?? d.rules.endpoint, set: (d, s, v) => updateLink(d, s.id, { toDate: v as 'start' | 'end' }),
    },
    note('reason', (d, s) => t(`schedule.reason.${interval(d, link(d, s)).reason}` as MessageKey)),
    {
      kind: 'color', key: 'linkColor', label: 'schedule.link.color', emptyLabel: 'schedule.color.default', fallback: '#52677e',
      get: (d, s) => link(d, s).branchColor ?? '',
      set: (d, s, v) => { const { branchColor: _b, ...rest } = link(d, s); return { ...d, links: d.links.map(l => (l.id === s.id ? (v ? { ...rest, branchColor: v } : rest) : l)) }; },
    },
  ];
}

type Look = keyof ScheduleCustomLook;
const lookColor = (key: Extract<Look, 'card' | 'border' | 'ink' | 'line'>): F => ({
  kind: 'color', key: `look-${key}`, label: `schedule.look.${key}` as MessageKey,
  fallback: '#ffffff',
  get: d => customOf(d.appearance)[key] ?? THEME_SWATCH[themeOf(d.appearance)][key],
  set: (d, _s, v) => setCustom(d, { [key]: v }),
});
const lookNumber = (key: 'radius' | 'width' | 'lineWidth', min: number, max: number, step: number): F => ({
  kind: 'number', key: `look-${key}`, label: `schedule.look.${key}` as MessageKey, unit: 'px', min, max, step,
  get: d => geometry(d.appearance)[key],
  set: (d, _s, v) => setCustom(d, { [key]: v }),
});
const size = (key: 'title' | 'body' | 'time', min: number, max: number): F => ({
  kind: 'number', key: `size-${key}`, label: `schedule.size.${key}` as MessageKey, unit: 'px', min, max, step: 1,
  get: d => textSizes(d)[key],
  set: (d, _s, v) => setSizes(d, { [key]: Math.round(v) } as Partial<ScheduleAppearance>),
});

const issueText = (i: Issue) => (i.kind === 'overdue' ? t('schedule.issueText.overdue')
  : i.reason === 'beforeParent' ? t('schedule.issueText.beforeParent', { name: i.parent ?? '' }) : t('schedule.issueText.endsBeforeStart'));

/**
 * Schedule overview (V2 af16 overview, L3430): the whole span with its first and last day, the
 * tasks by status as a bar with a legend, the milestones with their dates, and the tasks that need
 * attention (date conflicts, overdue) — each list item selects its task and brings it into view.
 */
const overview: F = {
  kind: 'custom', key: 'overview', label: 'schedule.overview.title',
  render: ({ doc, data, select }) => {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const box = el('section', 'af-overview');
    box.setAttribute('aria-label', t('schedule.overview.title'));
    box.append(el('h3', 'af-overview-title', t('schedule.overview.title')));
    const spans = data.tasks.map(spanOf), starts = spans.map(x => x.start).filter((v): v is number => v !== null), ends = spans.map(x => x.end).filter((v): v is number => v !== null);
    if (starts.length && ends.length) {
      const a = Math.min(...starts), b = Math.max(...ends), span = el('p', 'af-overview-span');
      span.append(el('strong', undefined, t('schedule.overview.days', { n: b - a + 1 })), el('span', undefined, `${formatDate(iso(a))} \u2192 ${formatDate(iso(b))}`));
      box.append(span);
    } else box.append(el('p', 'af-field-hint', t('schedule.overview.noDates')));
    // status bar and legend
    const counts = (['done', 'doing', 'todo'] as const).map(k => [k, data.tasks.filter(x => x.status === k).length] as const).filter(([, n]) => n);
    if (counts.length) {
      const bar = el('div', 'af-overview-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', counts.map(([k, n]) => `${t(`schedule.status.${k}` as MessageKey)} ${n}`).join('\u3001'));
      for (const [k, n] of counts) { const part = el('span', `is-${k}`); part.style.flex = String(n); bar.append(part); }
      const legend = el('p', 'af-overview-legend');
      for (const [k, n] of counts) legend.append(el('span', `is-${k}`, `${t(`schedule.status.${k}` as MessageKey)} ${n}`));
      box.append(bar, legend);
    }
    const now = today();
    const item = (title: string, sub: string, id: string, cls = '') => {
      const b = el('button', `af-overview-item${cls}`);
      b.type = 'button';
      b.append(el('span', undefined, title || t('schedule.untitled')), el('small', undefined, sub));
      b.addEventListener('click', () => select?.({ kind: 'task', id }));
      return b;
    };
    const ms = data.tasks.filter(x => x.milestone).map(x => ({ x, e: spanOf(x).end })).sort((a, b) => (a.e ?? 1e9) - (b.e ?? 1e9));
    if (ms.length) {
      box.append(el('p', 'af-overview-sub', t('schedule.overview.milestones')));
      const list = el('div', 'af-overview-list');
      for (const { x, e } of ms) {
        const when = e === null ? t('schedule.overview.noDate') : `${formatDate(iso(e))} \u00b7 ${x.status === 'done' ? t('schedule.status.done') : e < now ? t('schedule.overview.passed') : t('schedule.overview.inDays', { n: e - now })}`;
        list.append(item(`\u25c6 ${x.title}`, when, x.id, x.status === 'done' ? ' is-done' : ''));
      }
      box.append(list);
    }
    const warn = data.tasks.map(x => ({ x, i: issues(data, x, now) })).filter(w => w.i.length);
    box.append(el('p', 'af-overview-sub', warn.length ? t('schedule.overview.attentionN', { n: warn.length }) : t('schedule.overview.attention')));
    if (!warn.length) box.append(el('p', 'af-overview-ok', t('schedule.overview.ok')));
    else {
      const list = el('div', 'af-overview-list');
      for (const { x, i } of warn) list.append(item(x.title, issueText(i[0]), x.id, ' is-warning'));
      box.append(list);
    }
    return box;
  },
};

function designFields(): F[] {
  return [
    { ...overview, visible: (d: ScheduleData) => d.tasks.length > 0 },
    note('count', d => t('schedule.summary', { tasks: d.tasks.length, links: d.links.length, max: MAX_TASKS })),
    action('fixAll', d => { const k = conflictsBelow(d); return k ? t('schedule.fix.all', { count: k }) : ''; }, d => shiftConflicts(d).data, 'af-field-action is-warning'),
    {
      kind: 'group', key: 'rules', label: 'schedule.group.rules', open: true, fields: [
        { kind: 'segmented', key: 'endpoint', label: 'schedule.rules.endpoint', hint: 'schedule.rules.endpointHint', options: opts('schedule.endpoint', ['start', 'end'] as const), get: d => d.rules.endpoint, set: (d, _s, v) => ({ ...d, rules: { ...d.rules, endpoint: v as 'start' | 'end' } }) },
        { kind: 'segmented', key: 'count', label: 'schedule.rules.count', options: opts('schedule.count', ['difference', 'inclusive'] as const), get: d => d.rules.count, set: (d, _s, v) => ({ ...d, rules: { ...d.rules, count: v as 'difference' | 'inclusive' } }) },
      ],
    },
  ];
}

/** V2 "Design appearance" tab: look and sizes (snapping moved to the command bar's snap button). */
function lookFields(): F[] {
  const isCustom = (d: ScheduleData) => !!d.appearance.engineering;
  return [
    {
      kind: 'group', key: 'appearance', label: 'schedule.group.appearance', open: true, fields: [
        {
          kind: 'segmented', key: 'theme', label: 'schedule.look.theme', options: [...opts('schedule.theme', THEMES), { value: 'custom', label: 'schedule.theme.custom' }],
          get: d => (isCustom(d) ? 'custom' : themeOf(d.appearance)),
          set: (d, _s, v) => (v === 'custom' ? useCustom(d) : setTheme(d, v as ScheduleTheme)),
        },
        size('title', 12, 26), size('body', 10, 18), size('time', 10, 20),
        ...[lookColor('card'), lookColor('border'), lookColor('ink'), lookColor('line'), lookNumber('radius', 0, 16, 1), lookNumber('width', 1, 4, 0.5), lookNumber('lineWidth', 1, 6, 0.5)]
          .map(f => ({ ...f, visible: (d: ScheduleData) => isCustom(d) }) as F),
      ],
    },
  ];
}

/** Panel fields for the current selection (kind 'design' = nothing selected); tab 'look' = the appearance tab. */
export function scheduleFields(sel: CanvasSelection, d: ScheduleData, tab?: string): F[] {
  if (tab === 'look') return lookFields();
  if (sel.kind === 'task') return taskFields(d, sel);
  if (sel.kind === 'link') return linkFields();
  return designFields();
}
