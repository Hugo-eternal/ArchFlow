// module: shell, render, inspector, export, designs:function — block-diagram views (3.27a): switching between the function and the power view is presentation only (no undo step, kept through undo / redo, saved, marks unsaved); what each view draws; view-only inspector fields; export in another view.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { History } from '../../src/core/history';
import { Shell as BaseShell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import { setLocale } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import { blocksLayer } from '../../src/render/blocks';
import { wiresLayer, wireLabel, isMuted } from '../../src/render/wires';
import { routeAll } from '../../src/router/full-path';
import { find, toMarkup } from '../../src/render/vnode';
import { inView, wireFields } from '../../src/inspector/common';
import { fieldKeys } from '../../src/inspector/panel';
import { exportSvg } from '../../src/export/svg';
import { validateProject } from '../../src/io/schema';
import type { BlockDiagram } from '../../src/io/schema-types';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }

const ROOT = path.resolve(__dirname, '../..');
const golden = (name: 'function' | 'power'): BlockDiagram => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/${name}/__snapshots__/project.v3.json`), 'utf8'));
  return p.designs.find((d: { type: string; data: BlockDiagram }) => d.type === 'function' && d.data.view === name).data;
};
const key = (k: string, shift = false) => ({ key: k, shiftKey: shift, ctrlKey: false, metaKey: false, altKey: false, target: null }) as unknown as KeyboardEvent;

beforeEach(() => setLocale('zh-Hant'));

describe('History.patchAll', () => {
  it('changes the present and every snapshot without an undo step; undo / redo keep the patch', () => {
    const h = new History({ n: 0, view: 'function' });
    h.commit({ n: 1, view: 'function' });
    h.commit({ n: 2, view: 'function' });
    h.undo();
    h.markSaved();
    expect(h.patchAll(s => { s.view = 'power'; })).toBe(true);
    expect(h.dirty).toBe(true);
    expect(h.present).toEqual({ n: 1, view: 'power' });
    expect(h.undoDepth).toBe(1);
    h.undo();
    expect(h.present).toEqual({ n: 0, view: 'power' });
    h.redo(); h.redo();
    expect(h.present).toEqual({ n: 2, view: 'power' });
    h.markSaved();
    expect(h.patchAll(s => { s.view = 'power'; })).toBe(false);
    expect(h.dirty).toBe(false);
    expect(() => h.batch(() => h.patchAll(s => { s.view = 'function'; }))).toThrow();
  });
});

describe('view switch in the shell', () => {
  it('Shift+V and the view commands switch the view: not undoable, saved, marks unsaved', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function', template: 'starter' });
    expect(s.view).toBe('function');
    await s.run('block.add');
    const blocks = s.data().blocks.length;
    s.store.markSaved();

    expect(s.registry.handleKey(key('V', true), s)).toBe(true);
    expect(s.view).toBe('power');
    expect(s.store.dirty).toBe(true);
    expect(s.message?.key).toBe('view.mode.powerOn');
    // undo takes back the block, not the view
    await s.run('history.undo');
    expect(s.data().blocks.length).toBe(blocks - 1);
    expect(s.view).toBe('power');
    await s.run('history.redo');
    expect(s.view).toBe('power');

    // the view is saved with the file and is valid V3
    const file = s.store.toFile();
    expect((file.designs[0].data as BlockDiagram).view).toBe('power');
    expect(validateProject(file).ok).toBe(true);

    await s.run('view.mode.function');
    expect(s.view).toBe('function');
    await s.run('view.mode.toggle');
    expect(s.view).toBe('power');
    // plain V (no Shift) is not the toggle
    expect(s.registry.handleKey(key('v'), s)).toBe(false);
  });

  it('new blocks and wires follow the view', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    await s.run('view.mode.power');
    await s.run('block.add');
    const p = s.data().blocks[0];
    expect(p.role).toBe('converter');
    expect(Object.keys(p.metrics)).toEqual(['voltage', 'current']);
    await s.run('view.mode.function');
    await s.run('block.add');
    const f = s.data().blocks[1];
    expect(f.role).toBeUndefined();
    expect(f.metrics).toEqual({});
  });

  it('is disabled without a project', () => {
    const s = new Shell();
    for (const id of ['view.mode.function', 'view.mode.power', 'view.mode.toggle']) expect(s.enabled(id), id).toBe(false);
  });
});

describe('what each view draws', () => {
  it('power view: metrics and wire values; function view: names only, data kept', () => {
    const power = golden('power');
    const asFunction: BlockDiagram = { ...power, view: 'function' };
    const metric = (d: BlockDiagram) => find(blocksLayer(d), n => String(n.attrs.class ?? '').includes('af-block-metric')).length;
    expect(metric(power)).toBeGreaterThan(0);
    expect(metric(asFunction)).toBe(0);
    const shown = power.wires.find(w => w.electrical?.show)!;
    expect(wireLabel(shown, 'power')).not.toBe(wireLabel(shown, 'function'));
    expect(wireLabel(shown, 'function')).toBe(shown.name);
    expect(asFunction.wires).toEqual(power.wires);
  });

  it('power view fades every wire that is not a power wire', () => {
    const d = golden('function');
    const routes = routeAll(d);
    const muted = (x: BlockDiagram) => find(wiresLayer(x, routes), n => String(n.attrs.class ?? '').includes('af-wire-muted')).length;
    expect(muted(d)).toBe(0);
    expect(muted({ ...d, view: 'power' })).toBe(d.wires.filter(w => w.kind !== 'power').length);
    expect(isMuted({ ...d.wires[0], kind: 'power' }, 'power')).toBe(false);
  });

  it('golden function in the function view draws the same as before (no metrics, no faded wires)', () => {
    const d = golden('function');
    expect(toMarkup(wiresLayer(d, routeAll(d)))).not.toContain('af-wire-muted');
  });
});

describe('inspector fields by view', () => {
  it('inView lists fields only in their view and keeps their own visibility rule', () => {
    const d = m.emptyDiagram('power');
    const a = m.addBlock(d, m.makeBlock(d, { x: 0, y: 0 })), b = m.addBlock(a.data, m.makeBlock(a.data, { x: 300, y: 0 }));
    const bk = b.data.blocks.find(x => x.id === b.id)!, ak = b.data.blocks.find(x => x.id === a.id)!;
    const c = m.connect(b.data, { block: ak.id, port: ak.ports[0].id }, { block: bk.id, port: bk.ports[0].id });
    const sel = { kind: 'wire' as const, id: c.id };
    const specs = inView('power', wireFields());
    expect(fieldKeys(specs, c.data, sel)).toEqual(fieldKeys(wireFields(), c.data, sel));
    expect(fieldKeys(specs, { ...c.data, view: 'function' }, sel)).toEqual([]);
  });
});

describe('export in a view', () => {
  it('exports what the chosen view shows', () => {
    const power = golden('power');
    const asPower = exportSvg(power).source, asFunction = exportSvg({ ...power, view: 'function' }).source;
    const shown = power.wires.find(w => w.electrical?.show)!;
    expect(asPower).toContain(wireLabel(shown, 'power'));
    expect(asFunction).not.toContain(wireLabel(shown, 'power'));
    expect(asFunction.length).toBeLessThan(asPower.length);
  });
});
