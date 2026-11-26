// module: shell, designs:function, designs:schedule — step 3.41: notifications (V2 af2-toasts),
// status-bar counts (V2 #stats) and the empty-canvas hint (V2 #emptyCanvas).
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/core/i18n';
import { Shell as BaseShell, TOAST_MAX } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import { functionDesign } from '../../src/designs/function';
import { scheduleDesign } from '../../src/designs/schedule';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }
beforeEach(() => setLocale('zh-Hant'));

describe('notifications', () => {
  it('keeps the newest 3, dismissed by id; a new project or an opened file clears them', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    for (let i = 0; i < 5; i++) s.notify('file.opened');
    expect(s.toasts).toHaveLength(TOAST_MAX);
    const ids = s.toasts.map(x => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    s.dismissToast(ids[0]);
    expect(s.toasts.map(x => x.id)).toEqual(ids.slice(1));
    s.dismissToast(9999);                       // unknown: no change
    expect(s.toasts).toHaveLength(2);
    expect(s.message).toMatchObject({ key: 'file.opened' });   // the last message stays readable
    s.newProject('Q', { type: 'function' });
    expect(s.toasts).toEqual([]);
  });

  it('a refused edit is an error notification', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    s.refused({ ok: false, error: new Error('x') } as never);
    expect(s.toasts.at(-1)).toMatchObject({ tone: 'error', key: 'canvas.refused.text' });
  });
});

describe('status bar counts and empty hint', () => {
  it('block diagram: blocks · pins · wires · junctions (V2 #stats wording)', () => {
    const d = functionDesign.create({ template: 'starter' }).data;
    const ports = d.blocks.reduce((n, b) => n + b.ports.length, 0);
    expect(functionDesign.stats!(d)).toBe(`${d.blocks.length} 個方塊 · ${ports} 個接腳 · ${d.wires.length} 條線路 · ${d.junctions.length} 個分支接點`);
    expect(functionDesign.emptyHint!(d)).toBeNull();
    expect(functionDesign.emptyHint!(functionDesign.create().data)).toBe('hint.empty.diagram');
    setLocale('en');
    expect(functionDesign.stats!(d)).toMatch(/^\d+ blocks · \d+ pins · \d+ wires · \d+ junctions$/);
  });

  it('schedule: tasks and fork points', () => {
    const d = scheduleDesign.create({ template: 'starter' }).data;
    const out = new Map<string, number>();
    for (const l of d.links) out.set(l.from, (out.get(l.from) ?? 0) + 1);
    const forks = [...out.values()].filter(n => n > 1).length;
    expect(scheduleDesign.stats!(d)).toBe(`${d.tasks.length} 個任務 · ${forks} 個分支點`);
    expect(scheduleDesign.emptyHint!(d)).toBeNull();
    expect(scheduleDesign.emptyHint!(scheduleDesign.create().data)).toBe('hint.empty.schedule');
  });
});
