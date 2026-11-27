// module: designs:schedule, shell, export — step 3.29: schedule editing (tasks, branches, links,
// dragging with snapping, nudges), appearance (themes, custom look, branch colours), the
// appearance schema, the panel through the shell, and the export against V2.10.1.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setLocale, t } from '../../src/core/i18n';
import { validateData } from '../../src/io/schema';
import { estimateWidth } from '../../src/render/texts';
import { exportDrawing } from '../../src/export/svg';
import { emptySchedule, scheduleDesign } from '../../src/designs/schedule';
import { layout } from '../../src/designs/schedule/layout';
import { addBranch, appendTask, conflictsBelow, descendants, drag, MAX_TASKS, nudge, removeItems, resetOffsets, ScheduleEditError, setDefaultRange, setDuration, setParent, setTimeType, shiftConflicts } from '../../src/designs/schedule/edit';
import { geometry, lookStyle, setBranchColor, setCustom, setTheme, THEME_SWATCH, useCustom } from '../../src/designs/schedule/appearance';
import { scheduleFields } from '../../src/designs/schedule/fields';
import { fieldKeys } from '../../src/inspector/panel';
import { Shell as BaseShell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import type { ScheduleData } from '../../src/io/schema-types';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }
const ROOT = path.resolve(__dirname, '../..');
const golden = (): ScheduleData => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/schedule/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
const v2Svg = (): Record<string, string>[] => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/schedule/__snapshots__/export.svg.json'), 'utf8')).elements;

beforeEach(() => setLocale('zh-Hant'));

function chain(n: number): ScheduleData {
  let d = emptySchedule();
  for (let i = 0; i < n; i++) d = appendTask(d, `T${i}`).data;
  return d;
}

describe('tasks and links', () => {
  it('append: after the selected task, else after the last task without successors; at most 100', () => {
    let d = chain(3);
    expect(d.links.map(l => [l.from, l.to])).toEqual([[d.tasks[0].id, d.tasks[1].id], [d.tasks[1].id, d.tasks[2].id]]);
    d = appendTask(d, 'X', d.tasks[0].id).data;
    expect(d.links.at(-1)!.from).toBe(d.tasks[0].id);
    expect(() => appendTask(chain(MAX_TASKS), 'Y')).toThrow(ScheduleEditError);
  });

  it('branch: a task without successors gets a main-line successor first (V2 graphBranch)', () => {
    let d = chain(2);
    const leaf = d.tasks[1].id;
    const r = addBranch(d, leaf, { main: 'M', branch: 'B' });
    d = r.data;
    expect(d.tasks.slice(-2).map(x => x.title)).toEqual(['M', 'B']);
    expect(d.links.filter(l => l.from === leaf)).toHaveLength(2);
    const lay = layout(d);
    expect(lay.boxes.get(r.id)!.lane).toBe(1);
    expect(addBranch(d, leaf, { main: 'M', branch: 'B2' }).data.tasks).toHaveLength(d.tasks.length + 1);
  });

  it('remove a middle task: its successors are linked to its predecessor (V2 L772); a start task leaves starts', () => {
    const d = chain(3), [a, b, c] = d.tasks.map(x => x.id);
    const out = removeItems(d, [{ kind: 'task', id: b }]);
    expect(out.tasks.map(x => x.id)).toEqual([a, c]);
    expect(out.links.map(l => [l.from, l.to, l.days.mode])).toEqual([[a, c, 'auto']]);
    expect(removeItems(d, [{ kind: 'task', id: a }]).links.map(l => [l.from, l.to])).toEqual([[b, c]]);
    expect(removeItems(d, [{ kind: 'link', id: d.links[0].id }]).links).toHaveLength(1);
    // two removed at once: both reconnect in turn
    const four = chain(4);
    expect(removeItems(four, [{ kind: 'task', id: four.tasks[1].id }, { kind: 'task', id: four.tasks[2].id }]).links.map(l => [l.from, l.to])).toEqual([[four.tasks[0].id, four.tasks[3].id]]);
  });

  it('continue inserts after the selected task when it had one successor (V2 af16 L3583); new-task defaults', () => {
    const now = Date.UTC(2026, 10, 26) / 864e5;             // a Thursday
    let d = chain(2);
    const [a, b] = d.tasks.map(x => x.id);
    d = { ...d, tasks: d.tasks.map((x, i) => (i === 0 ? { ...x, time: { type: 'range', start: '2026-11-20', end: '2026-11-27' }, branchColor: '#aa3300' } : x)) };
    const r = appendTask(d, 'T1', a, { now });              // the title is taken: "T1 2"
    expect(r.inserted).toBe(true);
    expect(r.data.links.map(l => [l.from, l.to])).toEqual([[r.id, b], [a, r.id]]);
    const t = r.data.tasks.find(x => x.id === r.id)!;
    expect(t.title).toBe('T1 2');
    // after a Friday end: the next Monday; as long as the predecessor (8 days)
    expect(t.time).toEqual({ type: 'range', start: '2026-11-30', end: '2026-12-07' });
    expect(t.branchColor).toBe('#aa3300');
    expect(r.data.links.find(l => l.to === r.id)!.branchColor).toBe('#aa3300');
    // no predecessor dates: from today (a Thursday), 5 days
    const leaf = appendTask(emptySchedule(), 'N', undefined, { now });
    expect(leaf.inserted).toBe(false);
    expect(leaf.data.tasks.at(-1)!.time).toEqual({ type: 'range', start: '2026-11-26', end: '2026-11-30' });
    // a branch gets the defaults too
    const br = addBranch(r.data, a, { main: 'M', branch: 'B' }, { now });
    expect(br.data.tasks.at(-1)!.time.type).toBe('range');
  });

  it('duration, set a date range, shift conflicts (V2 af16)', () => {
    const now = Date.UTC(2026, 10, 26) / 864e5;
    let d = chain(3);
    const [a, b, c] = d.tasks.map(x => x.id);
    // appendTask dates new tasks from today: clear the first one so the fixed `now` decides (the test failed on other days)
    d = { ...d, tasks: d.tasks.map(x => (x.id === a ? { ...x, time: { type: 'none' } } : x)) };
    d = setDefaultRange(d, a, now);
    expect(d.tasks[0].time).toEqual({ type: 'range', start: '2026-11-26', end: '2026-11-30' });
    d = setDuration(d, a, 10);
    expect(d.tasks[0].time).toEqual({ type: 'range', start: '2026-11-26', end: '2026-12-05' });
    // b starts inside a, c after b: shifting b moves c with it, durations kept
    d = { ...d, tasks: d.tasks.map(x => (x.id === b ? { ...x, time: { type: 'range', start: '2026-12-01', end: '2026-12-03' } }
      : x.id === c ? { ...x, time: { type: 'deadline', date: '2026-12-04' } } : x)) };
    expect(conflictsBelow(d)).toBe(1);
    const r = shiftConflicts(d);
    expect(r.moved).toBe(1);
    expect(r.data.tasks[1].time).toEqual({ type: 'range', start: '2026-12-07', end: '2026-12-09' });   // Sat 6 → Mon 7
    expect(r.data.tasks[2].time).toEqual({ type: 'deadline', date: '2026-12-10' });
    expect(shiftConflicts(r.data)).toEqual({ data: r.data, moved: 0 });
    expect(shiftConflicts(d, c).moved).toBe(0);              // only below c's predecessor b: no conflict there
  });

  it('predecessor: kept link when unchanged, loops refused', () => {
    const d = chain(3), [a, b, c] = d.tasks.map(x => x.id);
    expect(setParent(d, b, a)).toEqual(d);
    expect(() => setParent(d, a, c)).toThrow(ScheduleEditError);
    const moved = setParent(d, c, a);
    expect(moved.links.find(l => l.to === c)!.from).toBe(a);
    expect([...descendants(d, a)]).toEqual([b, c]);
  });

  it('time type changes keep what they can', () => {
    const tk = { ...chain(1).tasks[0], time: { type: 'range' as const, start: '2026-01-01', end: '2026-01-09' } };
    expect(setTimeType(tk, 'deadline')).toEqual({ type: 'deadline', date: '2026-01-09' });
    expect(setTimeType({ ...tk, time: { type: 'deadline', date: '2026-02-02' } }, 'range')).toEqual({ type: 'range', start: '', end: '2026-02-02' });
  });
});

describe('dragging', () => {
  const mods = { shift: false, alt: false, zoom: 1 };
  it('cards move freely; axis points snap to other points (Alt: no snap, Shift: one direction)', () => {
    const d = golden(), [a, b] = d.tasks.map(x => x.id);
    expect(drag(d, a, 'card', 12, -8, mods).data.tasks[0].offset.card).toEqual({ x: 12, y: -8 });
    // point B 280 px right of A (axis 475 vs 190): a drag of −280 lands 5 px from A → snaps onto A's x
    const near = drag(d, b, 'axis', -280, 40, mods);
    expect(layout(near.data).boxes.get(b)!.axis.x).toBe(190);
    expect(near.guides.x).toBe(190);
    expect(layout(drag(d, b, 'axis', -280, 40, { ...mods, alt: true }).data).boxes.get(b)!.axis.x).toBe(195);
    const locked = drag(d, b, 'axis', 30, 4, { ...mods, shift: true, alt: true }).data;
    expect(locked.tasks[1].offset.axis).toEqual({ x: 30, y: 0 });
    expect(nudge(d, a, 0, -10).tasks[0].offset.axis).toEqual({ x: 0, y: -10 });
    expect(resetOffsets(locked).tasks[1].offset).toEqual({ card: { x: 0, y: 0 }, axis: { x: 0, y: 0 } });
  });
});

describe('appearance', () => {
  it('a preset switches the custom look off but keeps the custom slot (V2 L816)', () => {
    let d = golden();
    d = useCustom(d);
    expect(d.appearance.engineering).toMatchObject({ card: THEME_SWATCH.blue.card, radius: 4 });
    d = setCustom(d, { card: '#fff8e1', lineWidth: 3 });
    expect(lookStyle(d.appearance)).toContain('--sched-card:#fff8e1');
    expect(lookStyle(d.appearance)).toContain('--sched-link-width:3px');
    d = setTheme(d, 'mint');
    expect(d.appearance.engineering).toBeUndefined();
    expect(d.appearance.savedCustom).toMatchObject({ card: '#fff8e1' });
    expect(geometry(d.appearance).radius).toBe(4);
    expect(useCustom(d).appearance.engineering).toMatchObject({ card: '#fff8e1' });
    expect(validateData('schedule', useCustom(d))).toEqual([]);
  });

  it('the appearance schema: themes, sizes and custom look are checked', () => {
    const d = golden();
    expect(validateData('schedule', { ...d, appearance: { theme: 'pink' } })).not.toEqual([]);
    expect(validateData('schedule', { ...d, appearance: { title: 40 } })).not.toEqual([]);
    expect(validateData('schedule', { ...d, appearance: { engineering: { card: 'red' } } })).not.toEqual([]);
    expect(validateData('schedule', { ...d, appearance: { other: 1 } })).not.toEqual([]);
  });

  it('theme colours in TS match the tokens', () => {
    const tokens = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
    for (const th of ['mint', 'slate', 'amber'] as const) for (const k of ['card', 'border', 'ink', 'line'] as const) {
      expect(tokens.toLowerCase(), `${th} ${k}`).toContain(`--sched-${th}-${k}: ${THEME_SWATCH[th][k]}`);
    }
    for (const k of ['card', 'border', 'ink', 'line'] as const) expect(tokens.toLowerCase()).toContain(`--sched-${k}: ${THEME_SWATCH.blue[k]}`);
  });

  it('branch colour: the task, everything after it, and their links', () => {
    const d = chain(3), [a, b, c] = d.tasks.map(x => x.id);
    const out = setBranchColor(d, b, '#aa3300', descendants(d, b));
    expect(out.tasks.map(x => x.branchColor)).toEqual([undefined, '#aa3300', '#aa3300']);
    expect(out.links.map(l => l.branchColor)).toEqual(['#aa3300', '#aa3300']);
    expect(setBranchColor(out, b, null, descendants(out, b)).tasks.every(x => !x.branchColor)).toBe(true);
    expect([a, c]).toHaveLength(2);
  });
});

describe('panel and shell', () => {
  it('fields per selection; design-wide fields with nothing selected', () => {
    const d = golden();
    expect(fieldKeys(scheduleFields({ kind: 'task', id: d.tasks[0].id }, d), d, { kind: 'task', id: d.tasks[0].id }))
      .toEqual(expect.arrayContaining(['title', 'note', 'side', 'timeType', 'start', 'end', 'status', 'milestone', 'parent', 'branchColor']));
    expect(fieldKeys(scheduleFields({ kind: 'task', id: d.tasks[4].id }, d), d, { kind: 'task', id: d.tasks[4].id })).toContain('deadline');
    const linkSel = { kind: 'link', id: d.links[1].id };
    expect(fieldKeys(scheduleFields(linkSel, d), d, linkSel)).toEqual(['mode', 'days', 'linkColor']);
    const none = { kind: 'design', id: '' };
    expect(fieldKeys(scheduleFields(none, d), d, none)).toEqual(['endpoint', 'count', 'theme', 'size-title', 'size-body', 'size-time', 'snapOn', 'snapRange']);
  });

  it('commands: add task / branch / re-arrange, one undo step each; refusals are shown', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'schedule', template: 'starter' });
    s.setViewport({ w: 1200, h: 700 });
    const n = s.store.data(s.store.activeDesignId).tasks.length;
    await s.run('schedule.append');
    expect(s.store.data(s.store.activeDesignId).tasks).toHaveLength(n + 1);
    expect(s.item?.kind).toBe('task');
    expect(s.enabled('schedule.addBranch')).toBe(true);
    await s.run('schedule.addBranch');
    expect(s.store.data(s.store.activeDesignId).tasks).toHaveLength(n + 3);
    s.store.undo();
    expect(s.store.data(s.store.activeDesignId).tasks).toHaveLength(n + 1);
    // a loop through the panel's predecessor field is refused with a message
    const d = s.store.data(s.store.activeDesignId), first = d.tasks[0].id, last = d.tasks.at(-1)!.id;
    expect(s.editDesign(x => setParent(x as ScheduleData, first, last))).toBe(false);
    expect(s.message?.key).toBe('schedule.error.loop');
  });
});

describe('export (golden schedule vs V2.10.1)', () => {
  it('viewBox, card / label / point geometry and colours of the default theme', () => {
    const d = golden(), c = scheduleDesign.canvas!;
    const out = c.render(d, { selected: new Set([d.tasks[0].id]), measure: estimateWidth, forExport: true });
    const e = exportDrawing(out.node!, c.bounds(d));
    const v2 = v2Svg();
    expect(e.viewBox.join(' ')).toBe(v2[0].viewBox);
    expect(e.source).not.toMatch(/ class=| data-|var\(|<style/);
    const doc = new DOMParser().parseFromString(e.source, 'image/svg+xml');
    const els = [...doc.querySelectorAll('*')];
    // no canvas-only marks in the export
    expect(e.source).not.toContain(t('schedule.status.done'));
    expect(els.filter(x => x.tagName === 'circle')).toHaveLength(v2.filter(x => x.tag === 'circle').length);
    // the card bodies: V2 colours of the "engineering blue" theme
    const card = els.find(x => x.tagName === 'rect' && x.getAttribute('width') === '240')!;
    expect([card.getAttribute('fill')!.toLowerCase(), card.getAttribute('stroke')!.toLowerCase(), card.getAttribute('stroke-width'), card.getAttribute('rx')])
      .toEqual(['#f8fafc', '#64748b', '1.5', '4']);
    const link = els.find(x => x.tagName === 'path' && x.getAttribute('d') === 'M190,203 H475')!;
    expect([link.getAttribute('stroke')!.toLowerCase(), link.getAttribute('stroke-width')]).toEqual(['#52677e', '2']);
    const texts = els.filter(x => x.tagName === 'text').map(x => x.textContent).sort();
    expect(texts).toEqual(v2.filter(x => x.tag === 'text').map(x => x.text).sort());
  });
});
