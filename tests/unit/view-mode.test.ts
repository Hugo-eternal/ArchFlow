// module: core, render, inspector, export, shell, designs:function — step 3.27a: the function /
// power view of a block diagram (plan §2.2.1). Switching changes only the drawing, is saved with
// the file (marks it unsaved) and is not an undo step; render / inspector / export follow d.view.
import { describe, it, expect, beforeEach } from 'vitest';
import { History } from '../../src/core/history';
import { setLocale } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import { blocksLayer } from '../../src/render/blocks';
import { wiresLayer } from '../../src/render/wires';
import { estimateWidth } from '../../src/render/texts';
import { functionDesign } from '../../src/designs/function';
import { find } from '../../src/render/vnode';
import { routeAll } from '../../src/router/full-path';
import { exportSvg } from '../../src/export/svg';
import { inView, wireFields } from '../../src/inspector/common';
import { Shell as BaseShell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import type { BlockDiagram, BlockView } from '../../src/io/schema-types';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }

beforeEach(() => setLocale('zh-Hant'));

/** Two blocks with metrics, a power wire with values shown and a signal wire. */
function diagram(view: BlockView): BlockDiagram {
  let d = m.emptyDiagram(view);
  d.grid.snap = false;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A', metrics: { voltage: { value: '5', show: true } } }).data;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'B' }).data;
  const pa = m.addPort(d, 'A', 'out'); d = pa.data;
  const pb = m.addPort(d, 'B', 'in'); d = pb.data;
  const qa = m.addPort(d, 'A', 'out'); d = qa.data;
  const qb = m.addPort(d, 'B', 'in'); d = qb.data;
  d = m.connect(d, { block: 'A', port: pa.id }, { block: 'B', port: pb.id }, { name: 'VBUS', kind: 'power' }).data;
  d.wires[0].electrical = { voltage: '5', current: '2', show: true };
  d = m.connect(d, { block: 'A', port: qa.id }, { block: 'B', port: qb.id }, { name: 'SDA', kind: 'signal' }).data;
  return d;
}

const texts = (n: ReturnType<typeof wiresLayer>) => find(n, x => x.tag === 'text').map(x => x.text);
const groups = (n: ReturnType<typeof wiresLayer>) => find(n, x => x.attrs['data-wire'] !== undefined);

describe('History.amend', () => {
  it('changes the present and every snapshot, marks dirty, adds no undo step', () => {
    const h = new History({ v: 'a', n: 0 });
    h.commit({ v: 'a', n: 1 });
    h.commit({ v: 'a', n: 2 });
    h.undo();
    h.markSaved();
    expect(h.amend(s => ({ ...s, v: 'b' }))).toBe(true);
    expect(h.present).toEqual({ v: 'b', n: 1 });
    expect(h.dirty).toBe(true);
    expect(h.undoDepth).toBe(1);
    h.undo();
    expect(h.present).toEqual({ v: 'b', n: 0 });
    h.redo(); h.redo();
    expect(h.present).toEqual({ v: 'b', n: 2 });
    h.markSaved();
    expect(h.amend(s => ({ ...s, v: 'b' }))).toBe(false);
    expect(h.dirty).toBe(false);
  });
});

describe('render by view', () => {
  it('function view: no metrics, power wires without values, nothing faded', () => {
    const d = diagram('function'), routes = routeAll(d);
    const footer = (b: Parameters<NonNullable<typeof functionDesign.blockFooter>>[0], x: BlockDiagram) => functionDesign.blockFooter!(b, x, estimateWidth);
    expect(find(blocksLayer(d, { footer }), x => String(x.attrs.class).includes('af-metric'))).toHaveLength(0);
    const w = wiresLayer(d, routes);
    expect(texts(w)).toEqual(['VBUS', 'SDA']);
    expect(groups(w).some(g => String(g.attrs.class).includes('is-muted'))).toBe(false);
  });

  it('power view: metrics, power wire values, signal wires faded', () => {
    const d = { ...diagram('function'), view: 'power' as const }, routes = routeAll(d);
    const footer = (b: Parameters<NonNullable<typeof functionDesign.blockFooter>>[0], x: BlockDiagram) => functionDesign.blockFooter!(b, x, estimateWidth);
    expect(find(blocksLayer(d, { footer }), x => x.tag === 'text' && String(x.attrs.class).startsWith('af-metric')).map(x => x.text)).toEqual(['電壓', '5', 'V']);
    const w = wiresLayer(d, routes);
    expect(texts(w)).toEqual(['VBUS · 5 V · 2 A', 'SDA']);
    expect(groups(w).map(g => String(g.attrs.class).includes('is-muted'))).toEqual([false, true]);
  });
});

describe('export by view', () => {
  it('follows the diagram, or the view chosen in the dialog; geometry is the same', () => {
    const d = diagram('function');
    const own = exportSvg(d), power = exportSvg(d, { view: 'power' });
    expect(own.source).not.toContain('5 V · 2 A');
    expect(power.source).toContain('VBUS · 5 V · 2 A');
    expect(power.source).toMatch(/opacity="0\.35"/);
    expect(own.source).not.toMatch(/opacity="0\.35"/);
    expect(power.viewBox).toEqual(own.viewBox);
    expect(exportSvg({ ...d, view: 'power' }, { view: 'function' }).source).toBe(own.source);
  });
});

describe('inspector inView', () => {
  it('shows a field in one view only, keeping its own visibility rule', () => {
    const d = diagram('function'), sel = { kind: 'wire' as const, id: d.wires[0].id };
    const arrowSize = wireFields().flatMap(f => (f.kind === 'group' ? f.fields : [f])).find(f => f.key === 'arrowSize')!;
    const f = inView('power', arrowSize);
    expect(f.visible!(d, sel)).toBe(false);
    const p = { ...d, view: 'power' as const };
    expect(f.visible!(p, sel)).toBe(arrowSize.visible ? arrowSize.visible(p, sel) : true);
    p.wires = p.wires.map(w => ({ ...w, line: { ...w.line, arrow: false } }));
    expect(f.visible!(p, sel)).toBe(false);
  });
});

describe('shell view commands', () => {
  it('Shift+V and the switch change the view: saved, unsaved mark, no undo step', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function', template: 'starter' });
    expect(s.view).toBe('function');
    expect(s.store.dirty).toBe(false);
    const undoable = s.store.activeDesign!.history.canUndo;
    const key = { key: 'V', shiftKey: true, target: null };
    expect(s.registry.handleKey(key, s)).toBe(true);
    expect(s.view).toBe('power');
    expect(s.store.dirty).toBe(true);
    expect(s.store.activeDesign!.history.canUndo).toBe(undoable);
    expect(s.store.toFile().designs[0].data).toMatchObject({ view: 'power' });
    // an edit, then undo: the view stays
    await s.run('block.add');
    s.store.undo();
    expect(s.view).toBe('power');
    await s.run('view.mode.function');
    expect(s.view).toBe('function');
    await s.run('view.mode.function');
    expect(s.message?.key).toBe('view.mode.functionOn');
    // plain V (no Shift) is not the view switch
    expect(s.registry.handleKey({ key: 'v', target: null }, s)).toBe(false);
  });

  it('new blocks and wires follow the current view', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    await s.run('view.mode.power');
    await s.run('block.add');
    expect(s.data().blocks[0].role).toBe('converter');
    await s.run('view.mode.function');
    await s.run('block.add');
    expect(s.data().blocks[1].role).toBeUndefined();
  });

  it('is disabled without a project', () => {
    const s = new Shell();
    for (const id of ['view.mode.function', 'view.mode.power', 'view.mode.toggle']) expect(s.enabled(id), id).toBe(false);
  });
});
