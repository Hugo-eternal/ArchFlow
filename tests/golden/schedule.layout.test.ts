// module: designs:schedule — step 3.28: the V3 timeline layout and drawing against V2.10.1 on the
// golden schedule (cards, axis points, interval labels, the export's links / ticks / dots /
// milestone / card texts), plus branches, offsets, the inclusive count fix and the template.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setLocale, t } from '../../src/core/i18n';
import { estimateWidth } from '../../src/render/texts';
import { find, type VNode } from '../../src/render/vnode';
import { validateData } from '../../src/io/schema';
import { templateKeys } from '../../src/designs/module';
import { scheduleDesign, emptySchedule, shiftToWeek } from '../../src/designs/schedule';
import { layout, scheduleBounds, stem, structure, ScheduleError } from '../../src/designs/schedule/layout';
import { interval, issues, day } from '../../src/designs/schedule/dates';
import { scheduleLayer, intervalLabel } from '../../src/designs/schedule/render';
import starter from '../../src/designs/schedule/templates/starter.json';
import zh from '../../i18n/zh-Hant.json';
import en from '../../i18n/en.json';
import type { ScheduleData, Task } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const golden = (): ScheduleData => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/schedule/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
const summary = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/schedule/__snapshots__/summary.json'), 'utf8'));
const v2Svg = (): Record<string, string>[] => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/schedule/__snapshots__/export.svg.json'), 'utf8')).elements;
const half = (v: number) => Math.round(v * 2) / 2;

beforeEach(() => setLocale('zh-Hant'));

describe('layout vs V2.10.1 (golden schedule)', () => {
  it('cards and axis points where V2 put them', () => {
    const d = golden(), l = layout(d);
    for (const s of summary.tasks) {
      const b = l.boxes.get(s.id)!;
      expect([b.x, b.y, b.w, b.h, b.axis.x, b.axis.y].map(half), s.title).toEqual([s.x, s.y, s.w, s.h, ...s.axis]);
    }
    expect([...l.boxes.values()].map(b => b.ref)).toEqual(['T01', 'T02', 'T03', 'T04', 'T05']);
  });

  it('interval labels as V2 (auto from the start dates, manual days)', () => {
    const d = golden();
    expect(d.links.map(x => intervalLabel(d, x.id))).toEqual(summary.links.map((x: { label: string }) => x.label));
  });

  it('bounds are V2 graphBounds (the export viewBox)', () => {
    const vb = v2Svg()[0].viewBox.split(' ').map(Number);
    const b = scheduleBounds(layout(golden()))!;
    expect([b.x, b.y, Math.ceil(b.w), Math.ceil(b.h)]).toEqual(vb);
  });
});

describe('drawing vs V2.10.1 export (golden schedule)', () => {
  const draw = (d: ScheduleData) => scheduleLayer(d, layout(d), { measure: estimateWidth, today: day('2026-01-01')! });
  const attrs = (n: VNode, cls: string) => find(n, x => String(x.attrs.class ?? '').split(' ').includes(cls)).map(x => x.attrs);

  it('links, arrows, interval boxes, stems, ticks, dots and the milestone', () => {
    const n = draw(golden()), v2 = v2Svg();
    const v2paths = v2.filter(e => e.tag === 'path').map(e => e.d.replace(/\s+/g, ' '));
    for (const a of [...attrs(n, 'af-sched-link-line'), ...attrs(n, 'af-sched-link-arrow'), ...attrs(n, 'af-sched-stem'), ...attrs(n, 'af-sched-milestone')]) {
      expect(v2paths, String(a.d)).toContain(String(a.d).replace(/\s+/g, ' '));
    }
    const rect = (e: Record<string, unknown>) => ['x', 'y', 'width', 'height'].map(k => half(Number(e[k]))).join(' ');
    const v2rects = v2.filter(e => e.tag === 'rect').map(rect);
    for (const g of find(n, x => x.attrs.class === 'af-sched-interval')) expect(v2rects).toContain(rect(g.children[0].attrs));
    for (const a of attrs(n, 'af-sched-card-body')) expect(v2rects).toContain(rect(a));
    const line = (e: Record<string, unknown>) => ['x1', 'y1', 'x2', 'y2'].map(k => Number(e[k])).join(' ');
    const v2lines = v2.filter(e => e.tag === 'line').map(line);
    for (const a of [...attrs(n, 'af-sched-tick'), ...attrs(n, 'af-sched-rule')]) expect(v2lines).toContain(line(a));
    expect(attrs(n, 'af-sched-dot').map(a => `${a.cx},${a.cy}`)).toEqual(v2.filter(e => e.tag === 'circle').map(e => `${e.cx},${e.cy}`));
  });

  it('card texts at V2 positions (no chips in the export drawing)', () => {
    const n = draw(golden()), v2 = v2Svg().filter(e => e.tag === 'text');
    const texts = find(n, x => x.tag === 'text');
    expect(texts.map(x => x.text).sort()).toEqual(v2.map(e => e.text).sort());
    for (const x of texts) {
      const hit = v2.find(e => e.text === x.text && Math.abs(Number(e.x) - Number(x.attrs.x)) <= 0.5 && Math.abs(Number(e.y) - Number(x.attrs.y)) <= 0.5);
      expect(hit, `${x.text} at ${x.attrs.x},${x.attrs.y}`).toBeTruthy();
    }
  });

  it('canvas extras: status / milestone / issue chips; selection outline', () => {
    const d = golden(), l = layout(d);
    const n = scheduleLayer(d, l, { measure: estimateWidth, canvas: true, today: day('2026-02-20')!, selected: new Set([d.tasks[0].id]) });
    const chipTexts = find(n, x => x.attrs.class === 'af-sched-chips').map(c => find(c, x => x.tag === 'text').map(x => x.text));
    expect(chipTexts).toEqual([
      [t('schedule.status.done')], [t('schedule.status.doing'), t('schedule.issue.overdue')], [t('schedule.issue.overdue')], [], ['◆'],
    ].filter(x => x.length));
    expect(find(n, x => x.attrs.class === 'af-sched-selection')).toHaveLength(1);
  });
});

describe('layout rules', () => {
  const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, ref: '', note: '', side: 'top', time: { type: 'none' }, status: 'todo', milestone: false, offset: { card: { x: 0, y: 0 }, axis: { x: 0, y: 0 } }, ...over });
  const data = (tasks: Task[], links: [string, string][]): ScheduleData => ({ ...emptySchedule(), tasks, links: links.map(([from, to], i) => ({ id: `l${i}`, from, to, days: { mode: 'auto' } })) });

  it('a second child opens a new lane below; bottom cards hang under the axis; offsets move cards and points', () => {
    const d = data([task('a'), task('b'), task('c', { side: 'bottom' }), task('d', { offset: { card: { x: 5, y: -7 }, axis: { x: 0, y: 20 } } })], [['a', 'b'], ['a', 'c'], ['b', 'd']]);
    const l = layout(d), A = l.boxes.get('a')!, B = l.boxes.get('b')!, C = l.boxes.get('c')!, D = l.boxes.get('d')!;
    expect([B.lane, B.depth, C.lane, C.depth, D.depth]).toEqual([0, 1, 1, 1, 2]);
    expect(B.axis.y).toBe(A.axis.y);
    expect(C.axis.y).toBeGreaterThan(A.axis.y);
    expect(C.y).toBe(C.axis.y + 34);
    expect(D.axis.y).toBe(A.axis.y + 20);
    expect(D.x).toBe(D.axis.x - 120 + 5);
    expect(stem(A)).toBe(`M${A.axis.x},${A.axis.y} V${(A.axis.y + A.y + A.h) / 2} H${A.axis.x} V${A.y + A.h}`);
  });

  it('merges, loops and dangling links are refused (as V2)', () => {
    expect(() => structure(data([task('a'), task('b'), task('c')], [['a', 'c'], ['b', 'c']]))).toThrow(ScheduleError);
    expect(() => structure(data([task('a'), task('b')], [['a', 'b'], ['b', 'a']]))).toThrow(ScheduleError);
    expect(() => structure(data([task('a')], [['a', 'x']]))).toThrow(ScheduleError);
    expect(scheduleDesign.canvas!.render(data([task('a'), task('b'), task('c')], [['a', 'c'], ['b', 'c']]), { selected: new Set(), measure: estimateWidth }).error).toBe('schedule.error.merge');
  });

  it('count "inclusive" adds the first day (V2 ignored the rule, QUIRK 2.6); other interval reasons', () => {
    const d = golden(), l = d.links[0];
    expect(interval(d, l)).toEqual({ days: 14, reason: 'auto' });
    expect(interval({ ...d, rules: { ...d.rules, count: 'inclusive' } }, l)).toEqual({ days: 15, reason: 'autoInclusive' });
    expect(interval({ ...d, rules: { ...d.rules, endpoint: 'end' } }, l).days).toBe(14);
    const late = { ...d, tasks: d.tasks.map((x, i) => (i === 0 ? { ...x, time: { type: 'range' as const, start: '2026-05-01', end: '2026-05-02' } } : x)) };
    expect(interval(late, l)).toEqual({ days: null, reason: 'reversed' });
    expect(issues(late, late.tasks[1], 0)[0]).toMatchObject({ kind: 'conflict', reason: 'beforeParent' });
    expect(day('2026-02-30')).toBeNull();
  });
});

describe('module and starter template', () => {
  it('blank and template designs are valid V3 data; texts in both languages', () => {
    expect(scheduleDesign.create()).toEqual({ name: '', data: emptySchedule() });
    expect(validateData('schedule', emptySchedule())).toEqual([]);
    for (const locale of ['zh-Hant', 'en'] as const) {
      setLocale(locale);
      const { data, name } = scheduleDesign.create({ template: 'starter' });
      expect(validateData('schedule', data)).toEqual([]);
      expect(name).toBe(t('template.schedule.starter.name'));
      expect(JSON.stringify(data)).not.toContain('@i18n:');
      expect(data.texts).toHaveLength(2);
    }
    for (const k of templateKeys(starter)) { expect(zh).toHaveProperty([k]); expect(en).toHaveProperty([k]); }
  });

  it('template dates move by whole weeks to the current week (V2: anchor 2026-03-10)', () => {
    const tpl = (starter as unknown as { data: ScheduleData }).data;
    const moved = shiftToWeek(tpl, '2026-03-10', day('2026-11-26')!);
    // the dates V2.10.1 produced on 2026-11-26
    expect(moved.tasks.map(x => x.time)).toEqual([
      { type: 'range', start: '2026-11-16', end: '2026-11-20' }, { type: 'range', start: '2026-11-23', end: '2026-12-04' },
      { type: 'range', start: '2026-12-07', end: '2026-12-25' }, { type: 'range', start: '2026-12-28', end: '2027-01-08' },
      { type: 'range', start: '2027-01-11', end: '2027-01-14' },
    ]);
    expect(shiftToWeek(tpl, '2026-03-10', day('2026-03-10')!).tasks[0].time).toEqual({ type: 'range', start: '2026-03-02', end: '2026-03-06' });
  });
});
