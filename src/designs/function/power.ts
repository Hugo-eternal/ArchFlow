// designs/function — the power view's power features (plan §2.2.1, step 3.27b): the metric strip
// drawn at the bottom of a block, the "Power settings" panel group (role, voltage / current /
// power / efficiency with a show switch each, current unit), the wire's electrical fields, and
// the downstream demand vs the block's rated current.
//
// V2 (legacy/app.zh-Hant.html): appendMetrics + .block-metrics CSS (strip: padding 7 / 12, gaps
// 5 / 10, key 11 px + 5 px, unit metric − 2 px after 4 px), L1998 power field group, L2060 current
// unit (stored in A, shown in mA ×1000), L3843 af24 downstream demand / typed value turns the
// figure on / negative rails. (L3857, power pins on new blocks, is in model/diagram makeBlock.)
import type { Block, BlockDiagram, ItemRef, Metric, MetricKey, Wire } from '../../model/types';
import { updateBlock, updateWire } from '../../model/diagram';
import { t, type MessageKey } from '../../core/i18n';
import type { FieldSpec } from '../../inspector/fields';
import { inView } from '../../inspector/common';
import type { Measure } from '../../render/texts';
import { h, r2, type VNode } from '../../render/vnode';
import { normRail, railBand } from './parts';

type F = FieldSpec<BlockDiagram, ItemRef>;

export const METRIC_KEYS: readonly MetricKey[] = ['voltage', 'current', 'power', 'efficiency'];
export const METRIC_UNIT: Record<MetricKey, string> = { voltage: 'V', current: 'A', power: 'W', efficiency: '%' };
export const ROLES = ['source', 'converter', 'distribution', 'load'] as const;
export const CURRENT_UNITS = ['A', 'mA'] as const;

/** Strip geometry (V2 .block-metrics, measured in the golden power export). */
export const STRIP = { padX: 12, padY: 7, colGap: 10, rowGap: 5, keySize: 11, keyGap: 5, unitGap: 4, baseline: 3 } as const;

const fmt = (x: number) => String(Number(x.toPrecision(12)));
const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** The figure as shown: currents are stored in A and shown in the block's unit (V2 displayCurrent). */
export function shownValue(key: MetricKey, m: Metric | undefined): string {
  const v = (m?.value ?? '').trim();
  if (key !== 'current' || m?.unit !== 'mA' || v === '' || num(v) === null) return v;
  return fmt(Number(v) * 1000);
}

/** The unit after a figure. */
export const unitOf = (key: MetricKey, m: Metric | undefined) => (key === 'current' ? (m?.unit === 'mA' ? 'mA' : 'A') : METRIC_UNIT[key]);

/** A figure typed in the panel back to its stored value (mA → A). */
export function storedValue(key: MetricKey, typed: string, m: Metric | undefined): string {
  const v = typed.trim();
  if (key !== 'current' || m?.unit !== 'mA' || v === '' || num(v) === null) return v;
  return fmt(Number(v) / 1000);
}

/** One figure as text, e.g. "500 mA" (for summaries and tests). */
export function metricText(key: MetricKey, m: Metric): string {
  const v = shownValue(key, m);
  if (!v) return '';
  if (/[a-z%]$/i.test(v)) return v;
  return key === 'efficiency' ? `${v}%` : `${v} ${unitOf(key, m)}`;
}

/** Figures drawn on a block: those switched on, in V2's fixed order. */
export const shownMetrics = (b: Block) => METRIC_KEYS.filter(k => b.metrics[k]?.show);

/**
 * The metric strip of a block in the power view: a band along the bottom with "key value unit"
 * items laid out left to right, wrapping (V2 flex-wrap). Null in the function view or with no
 * figure switched on.
 */
export function metricStrip(b: Block, d: BlockDiagram, measure: Measure): { height: number; node: VNode } | null {
  if (d.view !== 'power' || b.part || b.connector) return null;
  const keys = shownMetrics(b);
  if (!keys.length) return null;
  const size = b.font?.metric ?? d.theme?.metric ?? 13, unitSize = size - 2;
  const left = b.x + 1 + STRIP.padX, right = b.x + b.w - 1 - STRIP.padX;
  type Item = { key: MetricKey; label: string; value: string; unit: string; w: number[] };
  const items: Item[] = keys.map(k => {
    const m = b.metrics[k], label = t(`power.metric.${k}` as MessageKey), value = shownValue(k, m) || '—', unit = unitOf(k, m);
    return { key: k, label, value, unit, w: [measure(label, STRIP.keySize, false, false), measure(value, size, false, false), measure(unit, unitSize, false, false)] };
  });
  const width = (it: Item) => it.w[0] + STRIP.keyGap + it.w[1] + STRIP.unitGap + it.w[2];
  // rows
  const rows: Item[][] = [[]];
  let x = left;
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row.length && x + width(it) > right) { rows.push([]); x = left; }
    rows[rows.length - 1].push(it);
    x += width(it) + STRIP.colGap;
  }
  const height = STRIP.padY * 2 + rows.length * size + (rows.length - 1) * STRIP.rowGap;
  const top = b.y + b.h - 1 - height;
  const texts: VNode[] = [];
  rows.forEach((row, r) => {
    const y = r2(top + STRIP.padY + r * (size + STRIP.rowGap) + size + STRIP.baseline);
    let cx = left;
    for (const it of row) {
      const empty = !shownValue(it.key, b.metrics[it.key]);
      texts.push(
        h('text', { class: 'af-metric-key', x: r2(cx), y, style: `font-size:${STRIP.keySize}px`, 'data-metric': it.key }, it.label),
        h('text', { class: `af-metric-value${empty ? ' is-empty' : ''}`, x: r2(cx + it.w[0] + STRIP.keyGap), y, style: `font-size:${size}px` }, it.value),
        h('text', { class: 'af-metric-unit', x: r2(cx + it.w[0] + STRIP.keyGap + it.w[1] + STRIP.unitGap), y, style: `font-size:${unitSize}px` }, it.unit),
      );
      cx += width(it) + STRIP.colGap;
    }
  });
  return {
    height: height + 1,
    node: h('g', { class: 'af-metrics' }, [
      h('rect', { class: 'af-metrics-strip', x: r2(b.x + 1), y: r2(top), width: r2(b.w - 2), height: r2(height) }),
      h('path', { class: 'af-metrics-rule', d: `M${r2(b.x + 1)},${r2(top)}H${r2(b.x + b.w - 1)}` }),
      ...texts,
    ]),
  };
}

// ---------------------------------------------------------------- downstream demand (V2 af24)

/** Blocks fed from a block's output side (right-hand or `out` ports), through junctions. */
export function fedBy(d: BlockDiagram, id: string): Block[] {
  const b = d.blocks.find(x => x.id === id);
  if (!b) return [];
  const key = (e: Wire['a']) => ('junction' in e ? `j:${e.junction}` : `n:${e.block}:${e.port}`);
  const start = b.ports.filter(p => p.side === 'r' || p.type === 'out').map(p => `n:${b.id}:${p.id}`);
  const seen = new Set(start), queue = [...start], found = new Map<string, Block>();
  while (queue.length) {
    const k = queue.shift()!;
    for (const w of d.wires) {
      const other = key(w.a) === k ? w.b : key(w.b) === k ? w.a : null;
      if (!other) continue;
      const ko = key(other);
      if (seen.has(ko)) continue;
      seen.add(ko);
      if ('junction' in other) queue.push(ko);
      else if (other.block !== b.id) { const m = d.blocks.find(x => x.id === other.block); if (m) found.set(m.id, m); }
    }
  }
  return [...found.values()];
}

/** Current drawn from a block's output, in A: converters with an efficiency by power, others as labelled. */
export function demand(d: BlockDiagram, id: string): number | null {
  const b = d.blocks.find(x => x.id === id);
  if (!b) return null;
  const vin = num(b.metrics.voltage?.value);
  let sum = 0, count = 0;
  for (const m of fedBy(d, id)) {
    const i = num(m.metrics.current?.value);
    if (i === null) continue;
    const v = num(m.metrics.voltage?.value), eta = num(m.metrics.efficiency?.value);
    sum += eta && eta > 0 && v !== null && vin ? Math.abs(v * i) / (Math.abs(vin) * eta / 100) : i;
    count++;
  }
  return count ? sum : null;
}

const fmt3 = (x: number) => { const a = Math.abs(x); return String(+x.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3)); };
/** "450 mA" below 1 A, else "1.2 A" (V2 amps). */
export const amps = (x: number) => (Math.abs(x) < 1 ? `${fmt3(x * 1000)} mA` : `${fmt3(x)} A`);

/** Demand against the rating: percentage and level (near ≥ 85 %, over > 100 %). */
export function load(d: BlockDiagram, id: string): { need: number; rating: number | null; pct: number | null; level: 'ok' | 'near' | 'over' } | null {
  const need = demand(d, id);
  if (need === null) return null;
  const b = d.blocks.find(x => x.id === id)!, r = num(b.metrics.current?.value);
  const rating = r ? Math.abs(r) : null, pct = rating ? Math.round(need / rating * 100) : null;
  return { need, rating, pct, level: pct === null ? 'ok' : pct > 100 ? 'over' : pct >= 85 ? 'near' : 'ok' };
}

// ---------------------------------------------------------------- panel fields (power view only)

const blockOf = (d: BlockDiagram, s: ItemRef): Block => {
  const b = d.blocks.find(x => x.id === s.id);
  if (!b) throw new Error(`no block ${s.id}`);
  return b;
};
const wireOf = (d: BlockDiagram, s: ItemRef): Wire => {
  const w = d.wires.find(x => x.id === s.id);
  if (!w) throw new Error(`no wire ${s.id}`);
  return w;
};

/** Empty, or a finite number (negative voltages allowed, V2 af24). */
const numeric = (v: string): MessageKey | null => (v.trim() === '' || num(v) !== null ? null : 'inspector.error.number');

function setMetric(d: BlockDiagram, id: string, key: MetricKey, patch: Partial<Metric>): BlockDiagram {
  const b = d.blocks.find(x => x.id === id)!;
  const m: Metric = { value: '', show: false, ...b.metrics[key], ...patch };
  return updateBlock(d, id, { metrics: { ...b.metrics, [key]: m } });
}

function metricFields(key: MetricKey): F[] {
  const fields: F[] = [{
    kind: 'text', key: `metric-${key}`, label: `power.metric.${key}` as MessageKey, maxLength: 24,
    hint: key === 'power' ? 'power.metric.powerHint' : key === 'voltage' ? 'power.metric.voltageHint' : undefined,
    get: (d, s) => shownValue(key, blockOf(d, s).metrics[key]),
    // typing a value into a hidden figure switches it on (V2 af24), in the same undo step
    set: (d, s, v) => {
      const m = blockOf(d, s).metrics[key], value = storedValue(key, v, m);
      return setMetric(d, s.id, key, value && !m?.show && !(m?.value ?? '').trim() ? { value, show: true } : { value });
    },
    validate: numeric,
  }];
  if (key === 'current') {
    fields.push({
      kind: 'segmented', key: 'metric-current-unit', label: 'power.metric.currentUnit', options: CURRENT_UNITS.map(u => ({ value: u, label: `power.unit.${u}` as MessageKey })),
      get: (d, s) => (blockOf(d, s).metrics.current?.unit === 'mA' ? 'mA' : 'A'),
      set: (d, s, v) => setMetric(d, s.id, 'current', { unit: v === 'mA' ? 'mA' : 'A' }),
    });
  }
  fields.push({
    kind: 'toggle', key: `metric-${key}-show`, label: `power.metric.${key}Show` as MessageKey,
    get: (d, s) => !!blockOf(d, s).metrics[key]?.show,
    set: (d, s, v) => setMetric(d, s.id, key, { show: v }),
  });
  return fields;
}

/** Downstream demand vs rated current (read only; V2 .af24-load). */
const demandField: F = {
  kind: 'custom', key: 'demand', label: 'power.demand',
  visible: (d, s) => demand(d, s.id) !== null,
  render: ({ doc, data, sel }) => {
    const l = load(data, sel.id)!;
    const row = doc.createElement('div');
    row.className = `af-power-load is-${l.level}`;
    row.title = t('power.demandHint');
    const text = doc.createElement('span');
    text.textContent = l.rating ? t('power.demandOf', { need: amps(l.need), rating: amps(l.rating) }) : t('power.demandOnly', { need: amps(l.need) });
    row.append(text);
    if (l.pct !== null) {
      const bar = doc.createElement('span');
      bar.className = 'af-power-load-bar';
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(Math.min(100, l.pct)));
      bar.setAttribute('aria-label', t('power.demand'));
      const fill = doc.createElement('i');
      fill.style.width = `${Math.min(100, l.pct)}%`;
      bar.append(fill);
      const pct = doc.createElement('b');
      pct.textContent = `${l.pct}%`;
      row.append(bar, pct);
    }
    return row;
  },
};

/** "Power settings" of a plain block — shown in the power view only, the data stays in both. */
export function powerBlockFields(): F[] {
  return [inView('power', {
    kind: 'group', key: 'power', label: 'power.group', open: true, fields: [
      {
        kind: 'select', key: 'role', label: 'power.role', options: ROLES.map(r => ({ value: r, label: `power.role.${r}` as MessageKey })),
        get: (d, s) => blockOf(d, s).role ?? 'load',
        set: (d, s, v) => updateBlock(d, s.id, { role: v }),
      },
      { kind: 'custom', key: 'power-note', label: 'power.note', render: ({ doc }) => { const p = doc.createElement('p'); p.className = 'af-field-note'; p.textContent = t('power.note'); return p; } },
      ...METRIC_KEYS.flatMap(metricFields),
      demandField,
    ],
  } as F)];
}

/** Electrical fields of a wire (voltage, current, unit, show) — power view only. */
export function powerWireFields(): F[] {
  const el = (d: BlockDiagram, s: ItemRef) => wireOf(d, s).electrical ?? { voltage: '', current: '', show: true };
  const set = (patch: Partial<NonNullable<Wire['electrical']>>) => (d: BlockDiagram, s: ItemRef) => updateWire(d, s.id, { electrical: { ...el(d, s), ...patch } });
  return [inView('power', {
    kind: 'group', key: 'electrical', label: 'power.wire.group', open: true, fields: [
      { kind: 'text', key: 'wire-voltage', label: 'power.wire.voltage', maxLength: 24, get: (d, s) => el(d, s).voltage, set: (d, s, v) => set({ voltage: v.trim() })(d, s) },
      { kind: 'text', key: 'wire-current', label: 'power.wire.current', maxLength: 24, get: (d, s) => el(d, s).current, set: (d, s, v) => set({ current: v.trim() })(d, s) },
      {
        kind: 'segmented', key: 'wire-unit', label: 'power.wire.unit', options: (['A', 'mA', 'uA'] as const).map(u => ({ value: u, label: `power.unit.${u}` as MessageKey })),
        get: (d, s) => el(d, s).unit ?? 'A', set: (d, s, v) => set({ unit: v as 'A' | 'mA' | 'uA' })(d, s),
      },
      { kind: 'toggle', key: 'wire-show', label: 'power.wire.show', get: (d, s) => el(d, s).show, set: (d, s, v) => set({ show: v })(d, s) },
    ],
  } as F)];
}

// ---------------------------------------------------------------- canvas warnings (3.29b a, plan §2.2.2)

/** Load badge geometry: under the block's bottom-left corner. */
export const LOAD_BADGE = { gap: 6, height: 20, padX: 7, font: 11 } as const;

/** Text of a block's load badge: "⚠ Downstream ≈ 2.3 A of 2 A (115%)" — icon and words, not colour alone. */
export function loadBadgeText(l: NonNullable<ReturnType<typeof load>>): string {
  const body = l.rating ? t('power.demandOf', { need: amps(l.need), rating: amps(l.rating) }) : t('power.demandOnly', { need: amps(l.need) });
  const icon = l.level === 'ok' ? '' : '⚠ ';
  return `${icon}${body}${l.pct !== null ? ` (${l.pct}%)` : ''}`;
}

/** Box of a block's load badge (for bounds and placement), or null when it has none. */
export function loadBadgeBox(b: Block, d: BlockDiagram, measure: Measure): { x: number; y: number; w: number; h: number; text: string; level: 'ok' | 'near' | 'over' } | null {
  if (d.view !== 'power' || b.part || b.connector) return null;
  const l = load(d, b.id);
  if (!l) return null;
  const text = loadBadgeText(l);
  return { x: b.x, y: b.y + b.h + LOAD_BADGE.gap, w: measure(text, LOAD_BADGE.font, true, false) + LOAD_BADGE.padX * 2, h: LOAD_BADGE.height, text, level: l.level };
}

/**
 * Power-view warnings on a block (drawn on the canvas and in exports): a "near" (≥ 85 %) or
 * "over" (> 100 %) outline around the block, and the load badge under it.
 */
export function loadWarning(b: Block, d: BlockDiagram, measure: Measure): VNode | null {
  const box = loadBadgeBox(b, d, measure);
  if (!box) return null;
  return h('g', { class: `af-load is-${box.level}`, 'data-load': b.id }, [
    box.level === 'ok' ? null : h('rect', { class: 'af-load-outline', x: r2(b.x - 5), y: r2(b.y - 5), width: r2(b.w + 10), height: r2(b.h + 10), rx: 10 }),
    h('rect', { class: 'af-load-badge', x: r2(box.x), y: r2(box.y), width: r2(box.w), height: box.h, rx: 4 }),
    h('text', { class: 'af-load-text', x: r2(box.x + LOAD_BADGE.padX), y: r2(box.y + box.h / 2), 'dominant-baseline': 'central', style: `font-size:${LOAD_BADGE.font}px` }, box.text),
  ]);
}

// ---------------------------------------------------------------- rail colours (3.29b b, plan §2.2.2)

/** Voltage of a power wire: its own electrical label, else the voltage of the block it comes from. */
export function wireVoltage(w: Wire, d: BlockDiagram): string {
  const own = normRail(w.electrical?.voltage ?? '');
  if (own) return own;
  const from = 'block' in w.a ? d.blocks.find(b => b.id === (w.a as { block: string }).block) : undefined;
  return normRail(from?.metrics.voltage?.value ?? '');
}

/** Rail colour band of a power wire in the power view (same voltage, same colour), else none. */
export function wireRail(w: Wire, d: BlockDiagram): string | undefined {
  if (d.view !== 'power' || w.kind !== 'power') return undefined;
  const v = wireVoltage(w, d);
  return v ? railBand(v) : undefined;
}

// ---------------------------------------------------------------- unrelated blocks (3.29b c, plan §2.2.2)

const POWER_PORTS = new Set(['power', 'gnd']);

/**
 * In the power view a block is faded when nothing about it is power: no power / ground pin, no
 * power wire attached, and it is not a supply / ground symbol.
 */
export function unrelatedToPower(b: Block, d: BlockDiagram): boolean {
  if (d.view !== 'power') return false;
  if (b.part && (b.part.kind === 'vcc' || b.part.kind === 'gnd')) return false;
  if (b.ports.some(p => POWER_PORTS.has(p.type))) return false;
  return !d.wires.some(w => w.kind === 'power' && [w.a, w.b].some(e => 'block' in e && e.block === b.id));
}
