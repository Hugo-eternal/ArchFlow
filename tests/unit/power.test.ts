// module: designs:function — step 3.27b: the power view's power features. The metric strip
// matches V2.10.1's exported .block-metrics on the golden power example; panel fields (power
// view only), current unit (stored in A), typed value switches a figure on, downstream demand.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setLocale, t } from '../../src/core/i18n';
import { Store } from '../../src/core/store';
import * as m from '../../src/model/diagram';
import { estimateWidth } from '../../src/render/texts';
import { find, type VNode } from '../../src/render/vnode';
import { blockInspector } from '../../src/inspector/common';
import { fieldKeys } from '../../src/inspector/panel';
import { exportSvg } from '../../src/export/svg';
import { routeAll } from '../../src/router/full-path';
import { wiresLayer } from '../../src/render/wires';
import { functionDesign } from '../../src/designs/function';
import { amps, demand, load, loadBadgeBox, loadWarning, metricStrip, wireRail, wireVoltage, unrelatedToPower, voltageLegend, legendNode, makePowerBlock, metricText, powerBlockFields, powerWireFields, shownValue, storedValue } from '../../src/designs/function/power';
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

describe('power view export vs V2.10.1 (golden power)', () => {
  it('wire labels, metric strips and block titles where V2 drew them', () => {
    const d = goldenPower(), v2 = v2Elements().filter(e => e.tag === 'text');
    const doc = new DOMParser().parseFromString(exportSvg(d, { footer: functionDesign.blockFooter, decorate: functionDesign.decorate }).source, 'image/svg+xml');
    const v3 = [...doc.querySelectorAll('text')].map(x => ({ text: x.textContent!, x: Number(x.getAttribute('x')), y: Number(x.getAttribute('y')), central: x.getAttribute('dominant-baseline') === 'central', size: Number(x.getAttribute('font-size')) }));
    const at = (text: string, ok: (c: (typeof v3)[number]) => boolean) => v3.some(c => c.text === text && ok(c));
    for (const w of d.wires) {
      const e = v2.find(x => x.text?.startsWith(w.name));
      expect(at(e!.text, c => Math.abs(c.x - Number(e!.x)) <= 1 && Math.abs(c.y - Number(e!.y)) <= 1), e!.text).toBe(true);
    }
    // the title line: V2 baseline − 0.38 em is V3's central y (the second line differs, see handoff 3.27c)
    for (const b of d.blocks) {
      const e = v2.find(x => x.text === b.partNumber)!;
      expect(at(b.partNumber, c => c.central && Math.abs(c.y - (Number(e.y) - 0.38 * Number(e['font-size']))) <= 1.5), b.partNumber).toBe(true);
    }
    for (const k of ['電壓', '電流', '效率']) expect(v3.filter(c => c.text === k)).toHaveLength(v2.filter(e => e.text === k).length);
  });
});

describe('load warnings (3.29b a, plan §2.2.2)', () => {
  const withRating = (d: BlockDiagram, id: string, value: string): BlockDiagram =>
    ({ ...d, blocks: d.blocks.map(b => (b.id === id ? { ...b, metrics: { ...b.metrics, current: { value, show: true } } } : b)) });
  it('upstream blocks get a demand / rating badge; ≥ 85 % near, > 100 % over, with an icon and the percentage', () => {
    const d = goldenPower(), src = d.blocks.find(b => b.role === 'source')!;
    const ok = loadWarning(src, d, estimateWidth)!;
    expect(String(ok.attrs.class)).toBe('af-load is-ok');
    expect(find(ok, x => x.tag === 'text')[0].text).toBe('下游需求 ≈ 926 mA / 額定 3 A (31%)');
    expect(find(ok, x => x.attrs.class === 'af-load-outline')).toHaveLength(0);
    const near = withRating(d, src.id, '1.05'), over = withRating(d, src.id, '0.5');
    const n = loadWarning(near.blocks.find(b => b.id === src.id)!, near, estimateWidth)!;
    expect(String(n.attrs.class)).toBe('af-load is-near');
    expect(find(n, x => x.tag === 'text')[0].text).toMatch(/^\u26a0 .*\(88%\)$/);
    const o = loadWarning(over.blocks.find(b => b.id === src.id)!, over, estimateWidth)!;
    expect(String(o.attrs.class)).toBe('af-load is-over');
    expect(find(o, x => x.attrs.class === 'af-load-outline')).toHaveLength(1);
    // loads feed nothing: no badge; the function view shows none
    expect(loadWarning(d.blocks.find(b => b.role === 'load')!, d, estimateWidth)).toBeNull();
    expect(loadWarning(src, { ...d, view: 'function' }, estimateWidth)).toBeNull();
  });

  it('is exported, and the export grows to hold the badge', () => {
    const d = goldenPower(), src = d.blocks.find(b => b.role === 'source')!;
    const opts = { footer: functionDesign.blockFooter, decorate: functionDesign.decorate, extras: functionDesign.exportExtras };
    const e = exportSvg(d, opts);
    expect(e.source).toContain('下游需求 ≈ 926 mA');
    const box = loadBadgeBox(src, d, estimateWidth)!;
    expect(e.viewBox[1] + e.viewBox[3]).toBeGreaterThanOrEqual(box.y + box.h);
    expect(exportSvg(d, { ...opts, view: 'function' }).source).not.toContain('下游需求');
  });
});

describe('power wires coloured by rail voltage (3.29b b)', () => {
  it('voltage from the wire label, else from the block it comes from; same voltage, same colour', () => {
    const d = goldenPower();
    expect(d.wires.map(w => wireVoltage(w, d))).toEqual(['12V', '5V', '5V', '3.3V']);
    expect(d.wires.map(w => wireRail(w, d))).toEqual(['high', 'mid', 'mid', 'logic']);
    expect(wireRail(d.wires[0], { ...d, view: 'function' })).toBeUndefined();
  });

  it('drawn with the rail token (wire and arrow), over the wire\'s own colour (V2 wrote one on every wire)', () => {
    const d = goldenPower(), routes = routeAll(d);
    const layer = wiresLayer(d, routes, { tone: w => wireRail(w, d) });
    const groups = find(layer, x => x.attrs['data-wire'] !== undefined).map(x => String(x.attrs.class));
    expect(groups.filter(c => c.includes('is-rail-mid'))).toHaveLength(2);
    const g0 = find(layer, x => x.attrs['data-wire'] === d.wires[0].id)[0];
    expect(find(g0, x => String(x.attrs.class).startsWith('af-wire af-wire-'))[0].attrs.style ?? '').not.toContain('stroke:');
    // the function view keeps the wire's own colour
    expect(find(wiresLayer({ ...d, view: 'function' }, routes, { tone: w => wireRail(w, { ...d, view: 'function' }) }), x => String(x.attrs.style ?? '').includes('stroke:#334e70')).length).toBe(4);
    const tokens = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
    const high = tokens.match(/--rail-high: (#[0-9A-F]{6})/i)![1];
    const arrow = { ...d, wires: d.wires.map((w, i) => (i === 0 ? { ...w, line: { ...w.line, arrow: true } } : w)) };
    const src = exportSvg(arrow, { wireTone: functionDesign.wireTone }).source;
    expect(src).toContain(`stroke="${high}"`);
    expect(src).toMatch(new RegExp(`<marker[^>]*>\\s*<path[^>]*fill="${high}"`));
  });
});

describe('blocks unrelated to power are faded in the power view (3.29b c)', () => {
  it('no power / ground pin and no power wire: faded; supplies and powered blocks are not', () => {
    setLocale('zh-Hant');
    const d = { ...functionDesign.create({ template: 'starter' }).data, view: 'power' as const };
    expect(d.blocks.map(b => [b.partNumber, unrelatedToPower(b, d)])).toEqual([['感測器', true], ['微控制器', false], ['無線模組', true], ['電源', false]]);
    expect(d.blocks.some(b => unrelatedToPower(b, { ...d, view: 'function' }))).toBe(false);
    expect(goldenPower().blocks.some(b => unrelatedToPower(b, goldenPower()))).toBe(false);
    const src = exportSvg(d, { blockFaded: functionDesign.blockFaded }).source;
    expect(src.match(/opacity="0\.4"/g)).toHaveLength(2);
    expect(exportSvg({ ...d, view: 'function' }, { blockFaded: functionDesign.blockFaded }).source).not.toMatch(/opacity="0\.4"/);
  });
});

describe('voltage legend (3.29b d)', () => {
  it('the voltages in use, highest first, with their colour band; none in the function view', () => {
    const d = goldenPower();
    expect(voltageLegend(d).map(i => `${i.text}:${i.band}`)).toEqual(['12V:high', '5V:mid', '3.3V:logic', '-12V:negative']);
    expect(voltageLegend({ ...d, view: 'function' })).toEqual([]);
    expect(functionDesign.legend!(d)!.items[0]).toEqual({ swatch: 'af-rail-high', text: '12V' });
    expect(functionDesign.legend!({ ...d, view: 'function' })).toBeNull();
  });

  it('exported under the drawing, inside the export bounds', () => {
    const d = goldenPower();
    const e = exportSvg(d, { extras: functionDesign.exportExtras, decorate: functionDesign.decorate, footer: functionDesign.blockFooter });
    expect(e.source).toContain(`>${t('power.legend.title')}<`);
    const lg = legendNode(voltageLegend(d), 0, 0, estimateWidth)!;
    expect(e.viewBox[1] + e.viewBox[3]).toBeGreaterThan(Math.max(...d.blocks.map(b => b.y + b.h)) + lg.box.h);
    expect(exportSvg({ ...d, view: 'function' }, { extras: functionDesign.exportExtras }).source).not.toContain(t('power.legend.title'));
  });
});

describe('power view insert menu (3.29b e)', () => {
  it('preset blocks per role: pins and prepared figures', () => {
    const d = m.emptyDiagram('power');
    const pins = (r: 'source' | 'converter' | 'distribution' | 'load') => makePowerBlock(d, { x: 0, y: 0 }, r).ports.map(p => `${p.name}:${p.type}:${p.side}`);
    expect(pins('source')).toEqual(['OUT:power:r']);
    expect(pins('load')).toEqual(['VDD:power:l']);
    expect(pins('converter')).toEqual(['VIN:power:l', 'OUT:power:r']);
    const c = makePowerBlock(d, { x: 0, y: 0 }, 'converter');
    expect([c.role, c.partNumber, Object.keys(c.metrics)]).toEqual(['converter', '電源轉換', ['voltage', 'current', 'efficiency']]);
    expect(makePowerBlock(d, { x: 0, y: 0 }, 'distribution').role).toBe('distribution');
  });
});

describe('role colours (power view)', () => {
  const accent = (src: string) => [...src.matchAll(/<path d="M[^"]*H[^"]*" stroke="([^"]+)"/g)].map(m => m[1]);
  it('the accent bar follows the role unless the block has its own accent; not in the function view', () => {
    let d = m.emptyDiagram('power');
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'S', role: 'source' }).data;
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 300, y: 0 }), id: 'L', role: 'load' }).data;
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 600, y: 0 }), id: 'C', role: 'load', style: { accent: '#123456' } }).data;
    const tokens = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
    const tok = (n: string) => tokens.match(new RegExp(`--${n}: (#[0-9A-F]{6})`, 'i'))![1];
    expect(accent(exportSvg(d).source)).toEqual([tok('role-source'), tok('role-load'), '#123456']);
    expect(accent(exportSvg(d, { view: 'function' }).source)).toEqual([tok('block-accent'), tok('block-accent'), '#123456']);
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
