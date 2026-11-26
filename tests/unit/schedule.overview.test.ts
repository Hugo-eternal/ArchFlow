// module: designs:schedule, inspector — step 3.43h: the schedule overview (V2 af16 overview L3430):
// span, status bar and legend, milestones, tasks that need attention; list items select their task.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/core/i18n';
import { scheduleFields } from '../../src/designs/schedule/fields';
import { scheduleDesign } from '../../src/designs/schedule';
import type { ScheduleData } from '../../src/io/schema-types';
import type { FieldSpec } from '../../src/inspector/fields';
import type { CanvasSelection } from '../../src/designs/module';

beforeEach(() => setLocale('zh-Hant'));

function render(d: ScheduleData, select?: (s: CanvasSelection) => void): HTMLElement {
  const f = scheduleFields({ kind: 'design', id: '' }, d).find(x => x.key === 'overview') as Extract<FieldSpec<ScheduleData, CanvasSelection>, { kind: 'custom' }>;
  return f.render({ data: d, sel: null as unknown as CanvasSelection, id: 'o', doc: document, apply: () => {}, select });
}

describe('schedule overview', () => {
  it('span, status counts, milestones and attention list; clicking selects the task', () => {
    const d = scheduleDesign.create({ template: 'product' }).data;
    // one conflict: the second task starts before the first ends
    const bad = { ...d, tasks: d.tasks.map((x, i) => (i === 1 ? { ...x, time: { type: 'range' as const, start: '2000-01-01', end: '2000-01-02' }, status: 'todo' as const } : x)) };
    const picked: CanvasSelection[] = [];
    const box = render(bad, s => picked.push(s));
    expect(box.querySelector('.af-overview-title')!.textContent).toBe('時程總覽');
    expect(box.querySelector('.af-overview-span strong')!.textContent).toMatch(/^\d+ 天$/);
    const legend = [...box.querySelectorAll('.af-overview-legend span')].map(x => x.textContent);
    const total = legend.reduce((n, s) => n + Number(/\d+$/.exec(s!)![0]), 0);
    expect(total).toBe(d.tasks.length);
    expect(box.querySelector('.af-overview-bar')!.getAttribute('role')).toBe('img');
    expect(box.querySelectorAll('.af-overview-item').length).toBeGreaterThan(0);
    const warn = box.querySelector<HTMLButtonElement>('.af-overview-item.is-warning')!;
    expect(warn.textContent).toContain(bad.tasks[1].title);
    warn.click();
    expect(picked).toEqual([{ kind: 'task', id: bad.tasks[1].id }]);
  });

  it('no dates: a hint; no problems: the all-clear line; hidden without tasks', () => {
    const d = scheduleDesign.create({ template: 'starter' }).data;
    const plain = { ...d, tasks: d.tasks.map(x => ({ ...x, time: { type: 'none' as const }, milestone: false })) };
    const box = render(plain);
    expect(box.textContent).toContain('為任務設定日期區間');
    expect(box.querySelector('.af-overview-ok')!.textContent).toContain('沒有日期衝突');
    const f = scheduleFields({ kind: 'design', id: '' }, d).find(x => x.key === 'overview')!;
    expect(f.visible!({ ...d, tasks: [] }, null as unknown as CanvasSelection)).toBe(false);
  });
});
