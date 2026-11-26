// module: core — V3 src/core/commands.ts (command registry and shortcuts).
import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry, parseShortcut, matchShortcut, formatShortcut, V2_HIDDEN_ELEMENT_COMMANDS } from '../../src/core/commands';
import type { Command } from '../../src/core/commands';

type Ctx = { canUndo: boolean; log: string[] };
const cmd = (id: string, extra: Partial<Command<Ctx>> = {}): Command<Ctx> => ({
  id, label: 'app.name', run: ctx => { ctx.log.push(id); }, ...extra,
});

describe('shortcuts', () => {
  it('parse and match, with Mod as Ctrl or Cmd', () => {
    expect(parseShortcut('Mod+Shift+Z')).toEqual({ key: 'z', mod: true, shift: true, alt: false });
    expect(parseShortcut('Del').key).toBe('delete');
    expect(parseShortcut('Mod++').key).toBe('+');
    expect(() => parseShortcut('Hyper+K')).toThrow();
    expect(matchShortcut('Mod+Z', { key: 'z', ctrlKey: true })).toBe(true);
    expect(matchShortcut('Mod+Z', { key: 'Z', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(matchShortcut('Mod+Z', { key: 'z', metaKey: true }, true)).toBe(true);
    expect(matchShortcut('Mod+Z', { key: 'z', metaKey: true }, false)).toBe(false);   // Cmd on Windows: no
    expect(matchShortcut('Mod++', { key: '+', ctrlKey: true, shiftKey: true })).toBe(true);  // shift ignored for symbols
    expect(formatShortcut('Mod+Shift+Z')).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(formatShortcut('Delete')).toBe('Delete');
    expect(formatShortcut('Shift+ArrowLeft')).toBe('Shift+\u2190');
    expect(formatShortcut('Escape')).toBe('Esc');
  });
});

describe('CommandRegistry', () => {
  it('runs enabled commands and refuses disabled or unknown ones', async () => {
    const r = new CommandRegistry<Ctx>();
    r.register(cmd('history.undo', { enabled: c => c.canUndo, shortcut: 'Mod+Z' }));
    r.register(cmd('view.fit', { shortcut: ['F', 'Mod+0'] }));
    const ctx: Ctx = { canUndo: false, log: [] };
    expect(await r.run('history.undo', ctx)).toBe(false);
    ctx.canUndo = true;
    expect(await r.run('history.undo', ctx)).toBe(true);
    expect(await r.run('nope', ctx)).toBe(false);
    expect(ctx.log).toEqual(['history.undo']);
    expect(r.forKey({ key: '0', ctrlKey: true })?.id).toBe('view.fit');
    expect(r.forKey({ key: 'f' })?.id).toBe('view.fit');
  });

  it('rejects duplicate ids and shortcuts; unregister frees both', () => {
    const r = new CommandRegistry<Ctx>();
    const off = r.register(cmd('a', { shortcut: 'Mod+K' }));
    expect(() => r.register(cmd('a'))).toThrow(/duplicate/);
    expect(() => r.register(cmd('b', { shortcut: 'Ctrl+k' }))).toThrow(/already used by "a"/);
    off();
    expect(r.has('a')).toBe(false);
    expect(() => r.register(cmd('b', { shortcut: 'Mod+K' }))).not.toThrow();
  });

  it('handleKey ignores plain keys typed in text fields, but not Mod shortcuts', () => {
    const r = new CommandRegistry<Ctx>();
    r.registerAll([cmd('selection.delete', { shortcut: 'Delete' }), cmd('project.save', { shortcut: 'Mod+S' })]);
    const ctx: Ctx = { canUndo: true, log: [] };
    const input = { tagName: 'INPUT', type: 'text' };
    expect(r.handleKey({ key: 'Delete', target: input }, ctx)).toBe(false);
    expect(r.handleKey({ key: 'Delete', target: { tagName: 'INPUT', type: 'checkbox' } }, ctx)).toBe(true);
    expect(r.handleKey({ key: 's', ctrlKey: true, target: input }, ctx)).toBe(true);
    expect(r.handleKey({ key: 'x' }, ctx)).toBe(false);
    expect(ctx.log).toEqual(['selection.delete', 'project.save']);
  });

  it('a throwing enabled() counts as disabled; list filters by group', async () => {
    const r = new CommandRegistry<Ctx>();
    const run = vi.fn();
    r.register({ id: 'x', label: 'app.name', group: 'edit', enabled: () => { throw new Error('boom'); }, run });
    r.register(cmd('y', { group: 'view' }));
    expect(await r.run('x', { canUndo: true, log: [] })).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(r.list('view').map(c => c.id)).toEqual(['y']);
    expect(r.list()).toHaveLength(2);
  });

  it('covers every hidden V1 element the V2 shell clicked (audit §4.1)', () => {
    const audited = ['view', 'add', 'saveProject', 'uiOpen', 'inspector', 'designSelect', 'workspaceManage', 'toggleInspector',
      'startScreen', 'startExamples', 'startCancel', 'scheduleBranch', 'scheduleAuto', 'reroute', 'projectName', 'p13Name',
      'newProject', 'managedDesignType', 'managedDesignExample', 'm2Reroute', 'fit', 'exportBtn', 'chineseFont',
      'afArrangeSelectedIO', 'addText', 'undo', 'stats', 'startLoad', 'renameDesign', 'remove', 'rcClearRoutes',
      'projectSaveState', 'notice', 'load', 'helpBtn', 'examplesBtn', 'englishFont', 'duplicateDesign', 'designBtn',
      'deleteDesign', 'createProject', 'addDesign'];
    expect(Object.keys(V2_HIDDEN_ELEMENT_COMMANDS).sort()).toEqual([...audited].sort());
    for (const id of Object.values(V2_HIDDEN_ELEMENT_COMMANDS)) if (id) expect(id).toMatch(/^[a-z]+\.[A-Za-z]+$/);
  });
});
