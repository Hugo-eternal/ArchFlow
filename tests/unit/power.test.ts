// module: designs:function — step 3.27b: the power view's power features. The metric strip
// matches V2.10.1's exported .block-metrics on the golden power example; panel fields (power
// view only), current unit (stored in A), typed value switches a figure on, downstream demand.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setLocale } from '../../src/core/i18n';
import { Store } from '../../src/core/store';
import * as m from '../../src/model/diagram';
import { estimateWidth } from '../../src/render/texts';
import { find, type VNode } from '../../src/render/vnode';
import { blockInspector } from '../../src/inspector/common';
import { fieldKeys } from '../../src/inspector/panel';
import { exportSvg } from '../../src/export/svg';
import { functionDesign } from '../../src/designs/function';
import { amps, demand, load, metricStrip, metricText, powerBlockFields, powerWireFields, shownValue, storedValue } from '../../src/designs/function/power';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const goldenPower = (): BlockDiagram =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/power/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
const v2Elements = (): Record<string, string>[] =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/power/__snapshots__/export.svg.json'), 'utf8')).elements;

beforeEach(() => setLocale('zh-Hant'));

const texts = (n: VNode) => find(n, x => x.tag === 'text');
const px = (style: unknown) => Number(String(style).match(/font-size:([\d.]+)px/)![1]);

describe('metric strip vs V2.10.1 export (golden power)', () => {
  it('band and every "key value unit" item where V2 drew them', () => {
    const d = goldenPower(), v2 = v2Elements();
    expect(d.view).toBe('power');
    let items = 0;
    for (const b of d.blocks) {
      const s = metricStrip(b, d, estimateWidth)!;
      expect(s, b.id).not.toBeNull();
      const rect = find(s.node, x => x.tag === 'rect')[0].attrs;
      const band = v2.find(e => e.tag === 'rect' && e.fill === '#f0f5fc' && Math.abs(Number(e.x) - Number(rect.x)) <= 1 && Math.abs(Number(e.y) - Number(rect.y)) <= 1);
      expect(band, `band of ${b.id}`).toBeTruthy();
      expect(Math.abs(Number(band!.width) - Number(rect.width))).toBeLessThanOrEqual(1);
      expect(Math.abs(Number(band!.height) - Number(rect.height))).toBeLessThanOrEqual(1);
      for (const [i, tx] of texts(s.node).entries()) {
        // x: the first key exact; later items follow text widths, estimated here without a browser
        // (e.g. "-"), so the error of earlier figures carries over (≤ 3 px on this example)
        const tol = i === 0 ? 1 : 3;
        const hit = v2.find(e => e.tag === 'text' && e.text === tx.text && Number(e['font-size']) === px(tx.attrs.style)
          && Math.abs(Number(e.x) - Number(tx.attrs.x)) <= tol && Math.abs(Number(e.y) - Number(tx.attrs.y)) <= 1.5);
        expect(hit, `${b.id} "${tx.text}" at ${tx.attrs.x},${tx.attrs.y}`).toBeTruthy();
        items++;
      }
    }
    expect(items).toBe(v2.filter(e => e.tag === 'text' && /^(電壓|電流|功率|效率)$/.test(e.text ?? '')).length * 3);
  });

  it('is drawn in the power view only, and exported with the block', () => {
    const d = goldenPower();
    expect(metricStrip(d.blocks[0], { ...d, view: 'function' }, estimateWidth)).toBeNull();
    const src = exportSvg(d, { footer: functionDesign.blockFooter }).source;
    expect(src).toContain('>電壓<');
    expect(src).toContain('fill="#F0F5FC"');
    expect(exportSvg(d, { footer: functionDesign.blockFooter, view: 'function' }).source).not.toContain('>電壓<');
  });

  it('wraps onto more rows when the figures do not fit; an empty figure shows a dash', () => {
    let d = m.emptyDiagram('power');
    const b = { ...m.makeBlock(d, { x: 0, y: 0 }), w: 120, metrics: { voltage: { value: '3.3', show: true }, current: { value: '0.25', show: true, unit: 'mA' as const }, power: { value: '', show: true }, efficiency: { value: '91', show: true } } };
    d = m.addBlock(d, b).data;
    const s = metricStrip(d.blocks[0], d, estimateWidth)!;
    const ys = new Set(texts(s.node).map(x => x.attrs.y));
    expect(ys.size).toBeGreaterThan(1);
    expect(texts(s.node).map(x => x.text)).toContain('250');
    expect(texts(s.node).find(x => x.text === '—')!.attrs.class).toContain('is-empty');
  });
});

describe('values', () => {
  it('currents are stored in A and shown in the chosen unit', () => {
    expect(shownValue('current', { value: '0.25', show: true, unit: 'mA' })).toBe('250');
    expect(storedValue('current', '250', { value: '', show: true, unit: 'mA' })).toBe('0.25');
    expect(storedValue('voltage', ' -5 ', undefined)).toBe('-5');
    expect(metricText('current', { value: '2', show: true })).toBe('2 A');
    expect(amps(0.45)).toBe('450 mA');
    expect(amps(1.234)).toBe('1.23 A');
  });

  it('downstream demand follows wires and junctions; converters with an efficiency count by power', () => {
    const d = goldenPower();
    // 12 V input feeds the 5 V buck (5 V × 2 A at 90 %): 10 W / (12 V × 0.9) ≈ 0.926 A
    const src = d.blocks.find(b => b.role === 'source')!;
    expect(demand(d, src.id)).toBeCloseTo((5 * 2) / (12 * 0.9), 3);
    const l = load(d, src.id)!;
    expect(l.rating).toBe(3);
    expect(l.pct).toBe(31);
    expect(l.level).toBe('ok');
    const buck = d.blocks.find(b => b.metrics.efficiency)!;
    expect(load(d, buck.id)!.need).toBeGreaterThan(0);
    // loads feed nothing
    expect(demand(d, d.blocks.find(b => b.metrics.voltage?.value === '-12')!.id)).toBeNull();
  });
});

describe('panel (power view only)', () => {
  function setup(view: 'function' | 'power') {
    const d = { ...goldenPower(), view };
    const store = new Store();
    store.newProject('P', { type: 'function', name: 'D', data: d });
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const insp = blockInspector(root, store, { debounceMs: 0 });
    const data = () => store.data(store.activeDesignId) as BlockDiagram;
    return { store, root, insp, data };
  }

  it('block: role, figures with show switches and current unit, demand — not in the function view', () => {
    const d = goldenPower(), b = d.blocks.find(x => x.role === 'source')!, sel = { kind: 'block' as const, id: b.id };
    const keys = fieldKeys(powerBlockFields(), d, sel);
    expect(keys).toEqual(expect.arrayContaining(['role', 'metric-voltage', 'metric-voltage-show', 'metric-current', 'metric-current-unit', 'metric-power', 'metric-efficiency-show']));
    expect(fieldKeys(powerBlockFields(), { ...d, view: 'function' }, sel)).toEqual([]);
    const s = setup('power');
    s.insp.show(sel, functionDesign.inspectorFields!(sel, s.data()));
    expect(s.root.querySelector('.af-power-load')!.textContent).toContain('3 A');
    const f = setup('function');
    f.insp.show(sel, functionDesign.inspectorFields!(sel, f.data()));
    expect(f.root.querySelector('[data-field="metric-voltage"]')).toBeNull();
    expect(f.root.querySelector('[data-field="rails"]')).not.toBeNull();
  });

  it('typing a value into a hidden figure switches it on, in one undo step; mA is converted', () => {
    const s = setup('power');
    const b = s.data().blocks.find(x => x.role === 'source')!, sel = { kind: 'block' as const, id: b.id };
    s.insp.show(sel, functionDesign.inspectorFields!(sel, s.data()));
    const power = s.root.querySelector('[data-field="metric-power"] input') as HTMLInputElement;
    power.value = '36';
    power.dispatchEvent(new Event('change', { bubbles: true }));
    expect(s.data().blocks.find(x => x.id === b.id)!.metrics.power).toEqual({ value: '36', show: true });
    expect(s.store.activeDesign!.history.undoDepth).toBe(1);
    const unit = s.root.querySelector('[data-field="metric-current-unit"] input[value="mA"]') as HTMLInputElement;
    unit.checked = true;
    unit.dispatchEvent(new Event('change', { bubbles: true }));
    expect(s.data().blocks.find(x => x.id === b.id)!.metrics.current).toMatchObject({ value: '3', unit: 'mA' });
    expect((s.root.querySelector('[data-field="metric-current"] input') as HTMLInputElement).value).toBe('3000');
    const bad = s.root.querySelector('[data-field="metric-voltage"] input') as HTMLInputElement;
    bad.value = '12 volts';
    bad.dispatchEvent(new Event('change', { bubbles: true }));
    expect(s.data().blocks.find(x => x.id === b.id)!.metrics.voltage!.value).toBe('12');
  });

  it('wire: electrical labels in the power view only', () => {
    const d = goldenPower(), sel = { kind: 'wire' as const, id: d.wires[0].id };
    expect(fieldKeys(powerWireFields(), d, sel)).toEqual(['wire-voltage', 'wire-current', 'wire-unit', 'wire-show']);
    expect(fieldKeys(powerWireFields(), { ...d, view: 'function' }, sel)).toEqual([]);
  });
});
