// module: inspector — V3 src/inspector/* (field specs, panel built in one pass, shared block /
// port / wire / text fields) in jsdom, committing through interaction/commit on a real Store.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Store } from '../../src/core/store';
import { setLocale, t } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import { blockInspector, commonFields, blockFields, wireFields } from '../../src/inspector/common';
import { InspectorPanel, fieldKeys } from '../../src/inspector/panel';
import { parseValue, flatten, type FieldSpec } from '../../src/inspector/fields';
import type { BlockDiagram } from '../../src/io/schema-types';
import type { ItemRef } from '../../src/model/types';

function setup() {
  let d = m.emptyDiagram();
  d.grid.snap = false;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A' }).data;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'B' }).data;
  const pa = m.addPort(d, 'A', 'out'); d = pa.data;
  const pb = m.addPort(d, 'B', 'in'); d = pb.data;
  const w = m.connect(d, { block: 'A', port: pa.id }, { block: 'B', port: pb.id }); d = w.data;
  const tx = m.addText(d, { x: 0, y: 300 }, 'note'); d = tx.data;
  const store = new Store();
  store.newProject('P', { type: 'function', name: 'D', data: d });
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const refused: unknown[] = [];
  const insp = blockInspector(root, store, { debounceMs: 300, onRefused: r => refused.push(r) });
  const data = () => store.data(store.activeDesignId) as BlockDiagram;
  const undoCount = () => store.activeDesign!.history.canUndo;
  return { store, root, insp, data, refused, undoCount, portA: pa.id, wire: w.id, text: tx.id };
}

const ctl = (root: HTMLElement, key: string) => root.querySelector(`[data-field="${key}"] input, [data-field="${key}"] textarea, [data-field="${key}"] select`) as HTMLInputElement;
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const change = (el: HTMLElement) => el.dispatchEvent(new Event('change', { bubbles: true }));
const key = (el: HTMLElement, k: string, extra: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));

beforeEach(() => { setLocale('zh-Hant'); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('panel construction', () => {
  it('shows the empty message with no selection', () => {
    const s = setup();
    s.insp.show(null);
    expect(s.root.textContent).toBe(t('inspector.empty'));
  });

  it('builds every block field synchronously, with labels tied to controls', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const keys = [...s.root.querySelectorAll('[data-field]')].map(e => (e as HTMLElement).dataset.field);
    expect(keys).toEqual(['title', 'partNumber', 'ref', 'subtitle', 'titleAlign', 'fill', 'border', 'textColor', 'locked']);
    for (const c of s.root.querySelectorAll('input:not([type=radio]), textarea, select')) {
      const label = s.root.querySelector(`label[for="${c.id}"]`) ?? c.closest('label');
      expect(label, c.id).not.toBeNull();
      const described = c.getAttribute('aria-describedby')!.split(' ');
      for (const id of described) expect(document.getElementById(id)).not.toBeNull();
    }
    expect(ctl(s.root, 'ref').value).toBe(s.data().blocks[0].ref);
    expect(s.root.querySelector('details[data-group="style"] summary')!.textContent).toBe(t('inspector.group.style'));
  });

  it('chooses the shared fields by selection kind', () => {
    expect(commonFields({ kind: 'junction', id: 'x' })).toBeNull();
    expect(commonFields({ kind: 'frame', id: 'x' })).toBeNull();
    const s = setup();
    s.insp.show({ kind: 'port', block: 'A', id: s.portA });
    expect([...s.root.querySelectorAll('[data-field]')].map(e => (e as HTMLElement).dataset.field)).toEqual(['name', 'type', 'label', 'locked']);
    s.insp.show({ kind: 'text', id: s.text });
    expect(ctl(s.root, 'text').value).toBe('note');
    expect(s.root.querySelectorAll('[data-field="align"] input[type=radio]')).toHaveLength(3);
  });

  it('follows the interface language', () => {
    const s = setup();
    setLocale('en');
    s.insp.show({ kind: 'wire', id: s.wire });
    expect(s.root.querySelector('[data-field="name"] label')!.textContent).toBe('Signal name / bus label');
  });
});

describe('editing', () => {
  it('debounces typing into one commit and one undo step', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const input = ctl(s.root, 'title');
    type(input, 'P'); type(input, 'PM'); type(input, 'PMIC');
    expect(s.data().blocks[0].title).toBe('');
    vi.advanceTimersByTime(299);
    expect(s.undoCount()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(s.data().blocks[0].title).toBe('PMIC');
    s.store.undo();
    expect(s.data().blocks[0].title).toBe('');
    expect(input.value).toBe('');          // the panel follows undo
    expect(s.undoCount()).toBe(false);
  });

  it('commits at once on Enter and blur; Escape drops the pending value', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const ref = ctl(s.root, 'ref');
    type(ref, 'U9'); key(ref, 'Enter');
    expect(s.data().blocks[0].ref).toBe('U9');
    const pn = ctl(s.root, 'partNumber');
    type(pn, 'TPS1'); pn.dispatchEvent(new FocusEvent('blur'));
    expect(s.data().blocks[0].partNumber).toBe('TPS1');
    type(pn, 'oops'); key(pn, 'Escape');
    vi.advanceTimersByTime(1000);
    expect(s.data().blocks[0].partNumber).toBe('TPS1');
    expect(pn.value).toBe('TPS1');
  });

  it('a textarea keeps Enter for new lines and commits on Mod+Enter', () => {
    const s = setup();
    s.insp.show({ kind: 'text', id: s.text });
    const ta = ctl(s.root, 'text') as unknown as HTMLTextAreaElement;
    type(ta, 'a\nb'); key(ta, 'Enter');
    expect(s.data().texts[0].text).toBe('note');
    key(ta, 'Enter', { ctrlKey: true });
    expect(s.data().texts[0].text).toBe('a\nb');
  });

  it('typing in a second field first commits the first one', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    type(ctl(s.root, 'title'), 'X');
    type(ctl(s.root, 'ref'), 'U7');
    expect(s.data().blocks[0].title).toBe('X');
    vi.advanceTimersByTime(300);
    expect(s.data().blocks[0].ref).toBe('U7');
  });

  it('select, segmented and toggle fields commit on change', () => {
    const s = setup();
    s.insp.show({ kind: 'port', block: 'A', id: s.portA });
    const sel = ctl(s.root, 'type') as unknown as HTMLSelectElement;
    sel.value = 'power'; change(sel);
    const radio = s.root.querySelector('[data-field="label"] input[value="outside"]') as HTMLInputElement;
    radio.checked = true; change(radio);
    const lock = ctl(s.root, 'locked');
    lock.checked = true; change(lock);
    const p = m.portOf(s.data(), 'A', s.portA)!;
    expect([p.type, p.label, p.locked]).toEqual(['power', 'outside', true]);
    for (let i = 0; i < 3; i++) s.store.undo();
    expect(m.portOf(s.data(), 'A', s.portA)!.type).toBe('out');
    expect((s.root.querySelector('[data-field="label"] input[value="inside"]') as HTMLInputElement).checked).toBe(true);
  });

  it('shows a range error and commits nothing', () => {
    const s = setup();
    s.insp.show({ kind: 'wire', id: s.wire });
    const width = ctl(s.root, 'width');
    type(width, '99'); key(width, 'Enter');
    expect(s.data().wires[0].line.width).toBe(2.2);
    expect(width.getAttribute('aria-invalid')).toBe('true');
    const err = document.getElementById(width.getAttribute('aria-describedby')!.split(' ').pop()!)!;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe(t('inspector.error.range'));
    type(width, '3'); key(width, 'Enter');
    expect(s.data().wires[0].line.width).toBe(3);
    expect(width.hasAttribute('aria-invalid')).toBe(false);
    expect(err.hidden).toBe(true);
  });

  it('rebuilds when a field appears, keeping focus', () => {
    const s = setup();
    s.insp.show({ kind: 'wire', id: s.wire });
    expect(ctl(s.root, 'arrowSize')).toBeNull();
    const arrow = ctl(s.root, 'arrow');
    arrow.focus();
    arrow.checked = true; change(arrow);
    expect(s.data().wires[0].line.arrow).toBe(true);
    const size = ctl(s.root, 'arrowSize');
    expect(size.value).toBe('9');
    expect((document.activeElement as HTMLElement).closest('[data-field]')!.getAttribute('data-field')).toBe('arrow');
    type(size, '14'); vi.advanceTimersByTime(300);
    expect(s.data().wires[0].line.arrowSize).toBe(14);
  });

  it('colour fields: pick a colour, then reset to the default / transparent', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const fill = ctl(s.root, 'fill');
    expect(fill.dataset.empty).toBe('true');
    fill.value = '#ff0000'; change(fill);
    expect(s.data().blocks[0].style.fill).toBe('#ff0000');
    (s.root.querySelector('[data-field="fill"] button') as HTMLButtonElement).click();
    expect('fill' in s.data().blocks[0].style).toBe(false);
    s.insp.show({ kind: 'text', id: s.text });
    const bg = ctl(s.root, 'background');
    bg.value = '#00ff00'; change(bg);
    expect(s.data().texts[0].background).toBe('#00ff00');
    (s.root.querySelector('[data-field="background"] button') as HTMLButtonElement).click();
    expect(s.data().texts[0].background).toBe('transparent');
  });

  it('an unchanged value commits nothing', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const ref = ctl(s.root, 'ref');
    key(ref, 'Enter');
    expect(s.undoCount()).toBe(false);
  });

  it('a refused commit puts the control back to the stored value', () => {
    const s = setup();
    const refused: unknown[] = [];
    const specs: FieldSpec<BlockDiagram, ItemRef>[] = [{
      kind: 'number', key: 'x', label: 'inspector.block.ref', get: (d, sel) => m.blockOf(d, sel.id)!.x,
      set: d => d,
    }];
    const panel = new InspectorPanel<BlockDiagram, ItemRef>(s.root, {
      data: s.data, commit: () => ({ ok: false }), onRefused: r => refused.push(r),
    });
    panel.show(specs, { kind: 'block', id: 'A' });
    const x = ctl(s.root, 'x');
    type(x, '55'); key(x, 'Enter');
    expect(refused).toHaveLength(1);
    expect(x.value).toBe('0');
    panel.destroy();
  });

  it('a lock refusal from commitEdit is reported', () => {
    const s = setup();
    s.store.commit({ ...s.data(), grid: { ...s.data().grid, snap: true } });
    s.store.commit(m.updateBlock(s.data(), 'A', { locked: true, x: 3 }));
    s.insp.show({ kind: 'block', id: 'A' });
    // unlocking alone is fine; but any change would have to move the locked off-grid block
    const ref = ctl(s.root, 'ref');
    type(ref, 'U5'); key(ref, 'Enter');
    expect(s.refused).toHaveLength(1);
    expect(s.data().blocks[0].ref).not.toBe('U5');
    expect(ref.value).toBe(s.data().blocks[0].ref);
  });

  it('drops the selection when its item disappears (undo of a new item)', () => {
    const s = setup();
    s.store.commit(m.addText(s.data(), { x: 0, y: 0 }, 'tmp').data);
    const id = s.data().texts[1].id;
    s.insp.show({ kind: 'text', id });
    s.store.undo();
    expect(s.root.textContent).toBe(t('inspector.empty'));
  });

  it('a change event from a control of the previous selection is ignored (pending text is flushed first)', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const old = ctl(s.root, 'title');
    type(old, 'typed');
    s.insp.show({ kind: 'text', id: s.text });       // flushes 'typed' into block A
    expect(s.data().blocks[0].title).toBe('typed');
    old.value = 'late';
    expect(() => change(old)).not.toThrow();         // browsers fire change when a focused input is removed
    expect(s.data().blocks[0].title).toBe('typed');
    expect(s.data().texts[0].text).toBe('note');
  });

  it('remembers open / closed groups across selections', () => {
    const s = setup();
    s.insp.show({ kind: 'block', id: 'A' });
    const g = s.root.querySelector('details[data-group="style"]') as HTMLDetailsElement;
    g.open = false; g.dispatchEvent(new Event('toggle'));
    s.insp.show({ kind: 'block', id: 'B' });
    expect((s.root.querySelector('details[data-group="style"]') as HTMLDetailsElement).open).toBe(false);
  });
});

describe('field specs', () => {
  it('parses values by kind', () => {
    const s = setup();
    const [num] = flatten(wireFields(), s.data(), { kind: 'wire', id: s.wire }).filter(f => f.key === 'width');
    expect(parseValue(num, '2.5')).toEqual({ ok: true, value: 2.5 });
    expect(parseValue(num, '')).toEqual({ ok: false, error: 'inspector.error.number' });
    expect(parseValue(num, 'abc')).toEqual({ ok: false, error: 'inspector.error.number' });
    expect(parseValue(num, '0.1')).toEqual({ ok: false, error: 'inspector.error.range' });
    const align = blockFields().find(f => f.key === 'titleAlign')!;
    expect(parseValue(align as never, 'nowhere')).toEqual({ ok: false, error: 'inspector.error.option' });
  });

  it('every option and label is an i18n key in both languages', () => {
    const all: FieldSpec<BlockDiagram, ItemRef>[] = [];
    const walk = (l: readonly FieldSpec<BlockDiagram, ItemRef>[]) => { for (const f of l) { all.push(f); if (f.kind === 'group') walk(f.fields); } };
    for (const k of ['block', 'port', 'wire', 'text'] as const) walk(commonFields({ kind: k, id: 'x', block: 'y' } as ItemRef)!);
    for (const loc of ['zh-Hant', 'en'] as const) {
      setLocale(loc);
      for (const f of all) {
        expect(t(f.label)).not.toBe(f.label);
        if ('options' in f) for (const o of f.options) expect(t(o.label)).not.toBe(o.label);
      }
    }
  });

  it('fieldKeys lists visible fields only', () => {
    const s = setup();
    expect(fieldKeys(wireFields(), s.data(), { kind: 'wire', id: s.wire })).not.toContain('arrowSize');
  });
});
