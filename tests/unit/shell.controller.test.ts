// module: shell, designs:schedule — V3 src/shell/controller.ts without a browser: commands registered once in the
// registry, edits as single undo steps, design list commands, dialogs and refusal messages.
import { describe, it, expect, beforeEach } from 'vitest';
import { Shell as BaseShell, refusalText } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }
import { setLocale, t } from '../../src/core/i18n';
import { GridError } from '../../src/core/grid';
import { ModelError } from '../../src/model/types';
import { V2_HIDDEN_ELEMENT_COMMANDS } from '../../src/core/commands';
import * as m from '../../src/model/diagram';

beforeEach(() => setLocale('zh-Hant'));

describe('shell controller', () => {
  it('starts on the start screen; commands that need a project are disabled', () => {
    const s = new Shell();
    expect(s.screen).toBe('start');
    for (const id of ['project.save', 'block.add', 'export.open', 'design.add']) expect(s.enabled(id), id).toBe(false);
    expect(s.enabled('project.open')).toBe(true);
  });

  it('registers every V3 command that replaces a V2 hidden button (audit §4.1)', () => {
    const s = new Shell();
    const ids = [...new Set(Object.values(V2_HIDDEN_ELEMENT_COMMANDS).filter((x): x is string => !!x))];
    const missing = ids.filter(id => !s.registry.has(id));
    expect(missing).toEqual([]);
  });

  it('3.39 commands: create / cancel from the start screen, rename, duplicate, reroute', async () => {
    const s = new Shell();
    expect(s.enabled('project.cancelNew')).toBe(false);
    await s.run('project.create', { name: 'P', choice: { type: 'function' } });
    expect(s.screen).toBe('workspace');
    expect(s.store.projectName).toBe('P');
    await s.run('project.new');
    expect(s.screen).toBe('start');
    expect(s.enabled('project.cancelNew')).toBe(true);
    await s.run('project.cancelNew');
    expect(s.screen).toBe('workspace');

    await s.run('project.rename');
    expect(s.dialog).toMatchObject({ kind: 'prompt', value: 'P' });
    (s.dialog as { ok: (v: string) => void }).ok('  Q  ');
    expect(s.store.projectName).toBe('Q');
    expect(s.store.dirty).toBe(true);

    await s.run('block.add');
    await s.run('block.add');
    const [a, b] = s.data().blocks;
    s.edit(d => {
      let x = m.addPort(d, a.id, 'out').data;
      x = m.addPort(x, b.id, 'in').data;
      return m.connect(x, { block: a.id, port: x.blocks[0].ports[0].id }, { block: b.id, port: x.blocks[1].ports[0].id }).data;
    });
    s.edit(d => ({ ...d, wires: d.wires.map(w => ({ ...w, route: [{ x: 1, y: 1 }] })) }));
    const steps = s.store.activeDesign!.history.undoDepth;
    await s.run('wire.reroute');
    expect(s.data().wires[0].route).toBeUndefined();
    expect(s.store.activeDesign!.history.undoDepth).toBe(steps + 1);
    s.gestures.select([{ kind: 'wire', id: s.data().wires[0].id }, { kind: 'block', id: a.id }]);
    expect(s.enabled('wire.clearRoutes')).toBe(true);
    await s.run('wire.clearRoutes');
    expect(s.gestures.selection).toEqual([{ kind: 'block', id: a.id }]);

    const first = s.store.activeDesignId;
    await s.run('design.duplicate');
    expect(s.store.designs).toHaveLength(2);
    expect(s.store.activeDesignId).not.toBe(first);
    expect(s.store.activeDesign!.name).toBe(`${s.store.designs[0].name} 副本`);
    expect(s.data()).toEqual(s.store.data(first));
    expect(s.store.activeDesign!.history.canUndo).toBe(false);
  });

  it('adds blocks, ports and text at the view centre as one undo step each', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    s.setViewport({ w: 1000, h: 600 });
    await s.run('block.add');
    const b = s.data().blocks[0];
    expect(b.x + b.w / 2).toBeCloseTo(500, -1);
    expect(s.gestures.selection).toEqual([{ kind: 'block', id: b.id }]);
    const ports = b.ports.length;
    await s.run('port.add');
    expect(s.data().blocks[0].ports).toHaveLength(ports + 1);
    expect(s.gestures.selection[0].kind).toBe('port');
    await s.run('text.add');
    expect(s.data().texts).toHaveLength(1);
    await s.run('history.undo'); await s.run('history.undo'); await s.run('history.undo');
    expect(s.data().blocks).toHaveLength(0);
    expect(s.store.dirty).toBe(true);
  });

  it('design list: add (prompt), rename, switch, delete (confirm); the last design cannot be deleted', async () => {
    const s = new Shell();
    s.newProject('P');
    expect(s.enabled('design.delete')).toBe(false);
    await s.run('design.add');
    expect(s.dialog?.kind).toBe('newDesign');
    s.addDesign({ type: 'function', name: 'B' });
    expect(s.dialog).toBeNull();
    expect(s.store.designs.map(d => d.name)).toEqual([t('design.defaultName', { n: 1 }), 'B']);
    expect(s.store.activeDesign!.name).toBe('B');
    await s.run('design.switch', s.store.designs[0].id);
    expect(s.store.activeDesignId).toBe(s.store.designs[0].id);
    await s.run('design.delete');
    if (s.dialog?.kind === 'confirm') s.dialog.ok();
    expect(s.store.designs.map(d => d.name)).toEqual(['B']);
  });

  it('new projects and designs come from the design module (blank or template)', () => {
    const s = new Shell();
    s.newProject('P', { type: 'function', template: 'starter' });
    expect(s.store.activeDesign!.name).toBe(t('template.function.starter.name'));
    expect(s.data().blocks).toHaveLength(4);
    expect(s.pendingFit).toBe(true);
    s.addDesign({ type: 'function' });
    expect(s.data().blocks).toHaveLength(0);
    expect(s.store.activeDesign!.name).toBe(t('design.defaultName', { n: 2 }));
  });

  it('asks before discarding unsaved changes', async () => {
    const s = new Shell();
    s.newProject('P');
    await s.run('block.add');
    await s.run('project.new');
    expect(s.dialog?.kind).toBe('confirm');
    expect(s.screen).toBe('workspace');
    if (s.dialog?.kind === 'confirm') s.dialog.ok();
    expect(s.screen).toBe('start');
  });

  it('refusal messages name the reason', () => {
    expect(refusalText({ ok: false, error: new GridError('locked-block', 'x') })).toBe(t('canvas.refused', { reason: t('canvas.refused.locked-block') }));
    expect(refusalText({ ok: false, error: new ModelError('limit-blocks') })).toContain(t('canvas.refused.limit'));
  });

  it('opening a V2 file shows "legacy format" and keeps the start screen', async () => {
    const s = new Shell();
    const r = await s.openBlob(new Blob([JSON.stringify({ applicationVersion: '1.8-rc4', designs: [] })]));
    expect(r.ok).toBe(false);
    expect(s.message).toMatchObject({ key: 'file.legacyFormat', tone: 'error' });
    expect(s.screen).toBe('start');
  });
});

describe('shell: schedule designs (3.28)', () => {
  it('a schedule from its template: drawn by the module, fitted, block commands off', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'schedule', template: 'starter' });
    expect(s.module?.type).toBe('schedule');
    expect(s.isBlockDiagram).toBe(false);
    for (const id of ['block.add', 'view.mode.toggle']) expect(s.enabled(id), id).toBe(false);
    expect(s.enabled('export.open')).toBe(true);
    expect(s.enabled('view.fit')).toBe(true);
    s.setViewport({ w: 1000, h: 600 });
    await s.run('view.fit');
    expect(s.camera.z).not.toBe(1);
    expect(s.store.dirty).toBe(false);
  });
});
