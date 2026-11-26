// designs/schedule — dates and interval days. Dates are "YYYY-MM-DD" strings counted as whole
// UTC days (weekends and holidays included, as V2).
//
// V2 (legacy/app.zh-Hant.html): scheduleDay L574, scheduleEndpoint L575, taskVisibleDate L616,
// intervalEndpoint / intervalState L622–L623, formatScheduleDate, af16 span / issues L3376–L3393.
// Fixed on purpose: V2 L624 replaced scheduleLabel with intervalState(e).label, so the rule
// `count: 'inclusive'` (count both ends) had no effect (QUIRK in 2.6); V3 adds the day.
import type { Link, ScheduleData, Task } from '../../io/schema-types';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day number of a "YYYY-MM-DD" date (days since 1970-01-01), or null when not a real date. */
export function day(value: string | undefined): number | null {
  const m = typeof value === 'string' ? DATE.exec(value) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 864e5;
}

/** "2026/01/05", or '' for an invalid date (V2 formatScheduleDate). */
export const formatDate = (value: string): string => (day(value) !== null ? value.replace(/-/g, '/') : '');

/** The dates a card shows: start / end rows of a range, or the deadline (V2 taskVisibleDate). */
export function visibleDates(t: Task): { key: 'start' | 'end' | 'deadline'; date: string }[] {
  if (t.time.type === 'deadline') return day(t.time.date) !== null ? [{ key: 'deadline', date: t.time.date }] : [];
  if (t.time.type === 'range') {
    const out: { key: 'start' | 'end'; date: string }[] = [];
    if (day(t.time.start) !== null) out.push({ key: 'start', date: t.time.start });
    if (day(t.time.end) !== null) out.push({ key: 'end', date: t.time.end });
    return out;
  }
  return [];
}

/** The date of a task used for an interval: its deadline, or the start / end of a complete range. */
export function endpoint(t: Task | undefined, which: 'start' | 'end'): number | null {
  if (!t) return null;
  if (t.time.type === 'deadline') return day(t.time.date);
  if (t.time.type === 'range') {
    const a = day(t.time.start), b = day(t.time.end);
    if (a === null || b === null || a > b) return null;
    return which === 'start' ? a : b;
  }
  return null;
}

export type IntervalReason = 'manual' | 'manualInvalid' | 'missing' | 'reversed' | 'auto' | 'autoInclusive';

/** Days between two linked tasks: manual, or the difference of their dates under the rules. */
export function interval(d: ScheduleData, l: Link): { days: number | null; reason: IntervalReason } {
  if (l.days.mode === 'manual') {
    const v = l.days.value;
    return Number.isSafeInteger(v) && v >= 0 && v <= 999999 ? { days: v, reason: 'manual' } : { days: null, reason: 'manualInvalid' };
  }
  const a = d.tasks.find(t => t.id === l.from), b = d.tasks.find(t => t.id === l.to);
  const x = endpoint(a, l.fromDate ?? d.rules.endpoint), y = endpoint(b, l.toDate ?? d.rules.endpoint);
  if (x === null || y === null) return { days: null, reason: 'missing' };
  if (y < x) return { days: null, reason: 'reversed' };
  return d.rules.count === 'inclusive' ? { days: y - x + 1, reason: 'autoInclusive' } : { days: y - x, reason: 'auto' };
}

/** Today as a day number (local calendar date). */
export function today(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
}

export type Issue = { kind: 'conflict'; reason: 'beforeParent' | 'endsBeforeStart'; parent?: string } | { kind: 'overdue' };

/** Date problems of a task (V2 af16 issues): starts before its predecessor ends, ends before it starts, overdue. */
export function issues(d: ScheduleData, t: Task, now: number = today()): Issue[] {
  const span = (x: Task) => (x.time.type === 'range' ? { s: day(x.time.start), e: day(x.time.end) } : x.time.type === 'deadline' ? { s: null, e: day(x.time.date) } : { s: null, e: null });
  const out: Issue[] = [], sp = span(t);
  const link = d.links.find(l => l.to === t.id), parent = link ? d.tasks.find(x => x.id === link.from) : undefined;
  if (parent) {
    const ps = span(parent);
    if (sp.s !== null && ps.e !== null && sp.s <= ps.e) out.push({ kind: 'conflict', reason: 'beforeParent', parent: parent.title });
  }
  if (sp.s !== null && sp.e !== null && sp.e < sp.s) out.push({ kind: 'conflict', reason: 'endsBeforeStart' });
  if (sp.e !== null && t.status !== 'done' && sp.e < now) out.push({ kind: 'overdue' });
  return out;
}
