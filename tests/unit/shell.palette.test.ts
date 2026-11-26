// module: shell, designs:function, designs:schedule — step 3.40: the command palette's entries
// (V2 af2-palette lg(): recent, commands, other designs, blocks / tasks) and the shortcuts list.
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/core/i18n';
import { Shell as BaseShell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import { filterPalette, paletteItems } from '../../src/shell/palette';
import { shortcutLabel, shortcutSections } from '../../src/shell/shortcuts';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }
beforeEach(() => setLocale('zh-Hant'));

describe('command palette', () => {
  it('opens with Mod+K in a project; help with Mod+? anywhere', async () => {
    const s = new Shell();
    expect(s.enabled('palette.open')).toBe(false);
    expect(s.enabled('help.open')).toBe(true);
    s.newProject('P', { type: 'function', template: 'starter' });
    expect(s.registry.handleKey({ key: 'k', ctrlKey: true, target: null }, s)).toBe(true);
    expect(s.dialog).toEqual({ kind: 'palette' });
    s.closeDialog();
    expect(s.registry.handleKey({ key: '?', ctrlKey: true, shiftKey: true, target: null }, s)).toBe(true);
    expect(s.dialog).toEqual({ kind: 'help' });
  });

  it('lists enabled commands only, without those needing an argument, then other designs and blocks', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function', template: 'starter' });
    s.addDesign({ type: 'schedule', template: 'starter', name: 'Plan' });
    s.store.activate(s.store.designs[0].id);
    const items = paletteItems(s);
    const cmds = items.filter(i => i.section === 'cmd').map(i => i.kw);
    expect(cmds).toContain('block.add');
    expect(cmds).toContain('export.open');
    expect(cmds).not.toContain('port.add');           // disabled: no block selected
    expect(cmds).not.toContain('design.switch');
    expect(cmds).not.toContain('palette.open');
    expect(cmds.some(id => id.startsWith('selection.nudge'))).toBe(false);
    expect(items.find(i => i.kw === 'view.fit')!.hint).toBe('F');
    expect(cmds).not.toContain('history.undo');      // nothing to undo yet
    expect(items.filter(i => i.section === 'design').map(i => i.label)).toEqual(['Plan']);
    const blocks = items.filter(i => i.section === 'item');
    expect(blocks.map(b => b.label)).toEqual(s.data().blocks.map(b => b.partNumber || b.title).filter(Boolean));
    // sections in V2 order
    const order = [...new Set(items.map(i => i.section))];
    expect(order).toEqual(['cmd', 'design', 'item']);
  });

  it('filters by every word (label, hint, id), case-insensitive', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function', template: 'starter' });
    const items = paletteItems(s);
    expect(filterPalette(items, '新增 方塊').map(i => i.kw)).toEqual(['block.add']);
    expect(filterPalette(items, 'EXPORT').map(i => i.kw)).toContain('export.open');
    expect(filterPalette(items, 'zz-nothing')).toEqual([]);
    expect(filterPalette(items, '  ')).toHaveLength(items.length);
  });

  it('runs a command and remembers it as recent (at most 5, not repeated while searching)', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    paletteItems(s).find(i => i.kw === 'block.add')!.run();
    expect(s.data().blocks).toHaveLength(1);
    const items = paletteItems(s);
    expect(items[0]).toMatchObject({ section: 'recent', kw: 'block.add' });
    expect(filterPalette(items, 'block.add').map(i => i.section)).toEqual(['cmd']);
    for (const id of ['view.fit', 'view.zoomIn', 'view.zoomOut', 'selection.selectAll', 'view.toggleInspector', 'block.add']) s.rememberCommand(id);
    expect(s.recentCommands).toEqual(['block.add', 'view.toggleInspector', 'selection.selectAll', 'view.zoomOut', 'view.zoomIn']);
  });

  it('goes to a block: selects it and centres the view; a task in a schedule', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function', template: 'starter' });
    s.setViewport({ w: 1000, h: 600 });
    const b = s.data().blocks[1];
    paletteItems(s).find(i => i.key === `item:${b.id}`)!.run();
    expect(s.gestures.selection).toEqual([{ kind: 'block', id: b.id }]);
    const c = s.camera;
    expect(c.x + (b.x + b.w / 2) * c.z).toBeCloseTo(500);
    expect(c.y + (b.y + b.h / 2) * c.z).toBeCloseTo(300);

    s.addDesign({ type: 'schedule', template: 'starter' });
    const tasks = paletteItems(s).filter(i => i.section === 'item');
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].hint).toBe('T01');
    tasks[0].run();
    expect(s.store.selection).toMatchObject({ kind: 'task' });
  });

  it('switches design', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    const first = s.store.activeDesignId;
    s.addDesign({ type: 'function', name: 'B' });
    paletteItems(s).find(i => i.section === 'design')!.run();
    expect(s.store.activeDesignId).toBe(first);
  });
});

describe('shortcuts list', () => {
  it('has every command with a shortcut once, grouped, formatted per platform', () => {
    const s = new Shell();
    const sections = shortcutSections(s, false);
    const ids = sections.flatMap(x => x.rows.map(r => r.id));
    const withKeys = s.registry.list().filter(c => c.shortcut !== undefined && !c.id.endsWith('Big')).map(c => c.id);
    expect(ids.sort()).toEqual([...withKeys].sort());
    const left = sections.flatMap(x => x.rows).find(r => r.id === 'selection.nudgeLeft')!;
    expect(left.keys).toBe('\u2190 / Shift+\u2190');
    expect(sections.map(x => x.title)[0]).toBe('shortcuts.section.project');
    expect(shortcutLabel(s, 'history.redo', false)).toBe('Ctrl+Shift+Z / Ctrl+Y');
    expect(shortcutLabel(s, 'history.redo', true)).toBe('⌘⇧Z / ⌘Y');
    expect(shortcutLabel(s, 'help.open', false)).toBe('Ctrl+?');
  });
});
