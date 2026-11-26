// Parts library of function designs: schematic symbols (passives, supply, ground) and voltage
// badges. Pure functions on the model plus the drawing used by DesignModule.decorate.
//
// V2: af15-ux2 "V2.3.0 — parts library and voltage badges" L3870–L4140 — CATS / ITEMS (L3900),
// GLYPH (L3924), SIZES / dims (L3940), placeSymbolPins (L3949), resize / rotate (L3957),
// normRail / railColor / cleanRails (L3965–L3976), decorate (L3978), shape (L4029), the
// export copy (L4125). Geometry measured in V2.10.1: symbol label 12 px / 600, centred, bottom
// 3 px above the part (supply: bottom 14 px below its top); badges 22 px high, top 9 px above
// the block, right edge 13 px inside it, 4 px apart, padding 7 / 10, 12 px bolt + 3 px gap.
// Connectors (`conn`) and the LCD template are step 3.26.
import type { Block, BlockDiagram, Part, Port } from '../../model/types';
import type { MessageKey } from '../../core/i18n';
import { uid } from '../../core/ids';
import { h, r2, type VNode } from '../../render/vnode';
import { estimateWidth, type Measure } from '../../render/texts';

export type PartKind = 'res' | 'cap' | 'capp' | 'ind' | 'bead' | 'dio' | 'led' | 'tvs' | 'fuse' | 'xtal' | 'vcc' | 'gnd';

export interface PartItem {
  kind: PartKind;
  label: MessageKey;
  /** Reference prefix (R, C, L …) — V2.3.3 inserts parts without a reference; kept for the panel hint. */
  prefix: string;
  /** Value presets offered in the panel (V2 `presets`). */
  presets: readonly string[];
  /** Initial value (supply only: V2 sets the voltage). */
  value?: string;
}

const P = (kind: PartKind, prefix: string, presets: string[], value?: string): PartItem => ({ kind, label: `part.${kind}` as MessageKey, prefix, presets, value });

/** The passive / symbol category of the V2 library, in V2 order. */
export const PARTS: readonly PartItem[] = [
  P('res', 'R', ['0Ω', '100Ω', '1kΩ', '4.7kΩ', '10kΩ', '100kΩ']),
  P('cap', 'C', ['10pF', '100nF', '1µF', '4.7µF', '10µF']),
  P('capp', 'C', ['10µF', '47µF', '100µF', '220µF']),
  P('ind', 'L', ['1µH', '2.2µH', '4.7µH', '10µH', '22µH']),
  P('bead', 'FB', ['120Ω', '600Ω', '1kΩ']),
  P('dio', 'D', []),
  P('led', 'D', []),
  P('tvs', 'D', []),
  P('fuse', 'F', ['0.5A', '1A', '2A', '3A']),
  P('xtal', 'Y', ['12MHz', '24MHz', '25MHz', '32.768kHz']),
  P('vcc', '', ['1.2V', '1.8V', '3.3V', '5V', '12V'], '3.3V'),
  P('gnd', '', []),
];
export const partItem = (kind: string) => PARTS.find(p => p.kind === kind);

type Shape = [tag: 'path' | 'rect', attrs: Record<string, string | number>];
const path = (d: string, extra: Record<string, string | number> = {}): Shape => ['path', { d, ...extra }];
const TINT = { fill: 'currentColor', 'fill-opacity': 0.14 };

/** Symbol drawings in their own viewBox (two-pin parts 100 × 40, gnd 40 × 40, vcc 60 × 40) — V2 GLYPH. */
export const GLYPH: Record<PartKind, Shape[]> = {
  res: [path('M0 20H30l3.3-8 6.7 16 6.7-16 6.6 16 6.7-16 6.7 16 3.3-8H100')],
  cap: [path('M0 20H46M46 8v24M54 8v24M54 20H100')],
  capp: [path('M0 20H46M46 8v24M58 8q-6 12 0 24M55 20H100M36 9h6M39 6v6')],
  ind: [path('M0 20H28a5.5 5.5 0 0 1 11 0 5.5 5.5 0 0 1 11 0 5.5 5.5 0 0 1 11 0 5.5 5.5 0 0 1 11 0H100')],
  bead: [path('M0 20H36M64 20H100'), ['rect', { x: 36, y: 12, width: 28, height: 16, rx: 2, fill: 'currentColor', 'fill-opacity': 0.16 }]],
  dio: [path('M0 20H40M60 20H100'), path('M40 9l20 11-20 11z', TINT), path('M60 9v22')],
  led: [path('M0 20H40M60 20H100'), path('M40 9l20 11-20 11z', TINT), path('M60 9v22M57 6l6-6M60 0h3v3M65 9l6-6M68 3h3v3')],
  tvs: [path('M0 20H34M66 20H100'), path('M34 9l16 11-16 11zM66 9L50 20l16 11z', TINT), path('M50 9v22M50 9l-3-3M50 31l3 3')],
  fuse: [path('M0 20H100'), ['rect', { x: 30, y: 13, width: 40, height: 14, rx: 2 }]],
  xtal: [path('M0 20H37M63 20H100M37 9v22M63 9v22'), ['rect', { x: 43, y: 7, width: 14, height: 26, rx: 1 }]],
  gnd: [path('M20 0V18M7 18H33M12 25H28M17 32H23')],
  vcc: [path('M30 40V18M16 18H44')],
};
const SYM_BOX: Partial<Record<PartKind, [number, number]>> = { gnd: [40, 40], vcc: [60, 40] };
export const isTwoPin = (k: string) => k in GLYPH && !(k in SYM_BOX);

/** S / M / L on the 10 px grid, leads centred on a grid line (V2.3.4). */
const SIZES = {
  two: { S: [80, 40], M: [100, 40], L: [140, 60] },
  gnd: { S: [40, 40], M: [40, 40], L: [60, 60] },
  vcc: { S: [60, 40], M: [60, 40], L: [80, 60] },
} as const;
export function partSize(kind: string, size: Part['size'], rot: Part['rot']): [number, number] {
  const t = SIZES[kind === 'gnd' || kind === 'vcc' ? kind : 'two'][size];
  return isTwoPin(kind) && rot === 90 ? [t[1], t[0]] : [t[0], t[1]];
}
/** Sizes the panel offers (supply and ground have no S, V2). */
export const sizesFor = (kind: string): Part['size'][] => (kind === 'gnd' || kind === 'vcc' ? ['M', 'L'] : ['S', 'M', 'L']);

const pin = (name: string, side: Port['side'], type: string, keep?: Port): Port =>
  ({ id: keep?.id ?? uid(), name, side, t: 0.5, type, label: 'hidden', locked: keep?.locked ?? false });

/** The pins of a symbol (V2 placeSymbolPins): existing pin ids are kept so wires stay attached. */
export function symbolPins(b: Pick<Block, 'ports' | 'partNumber'>, part: Part): Port[] {
  const k = part.kind;
  if (k === 'gnd') return [pin('GND', 't', 'gnd', b.ports[0])];
  if (k === 'vcc') return [pin(b.partNumber || 'VCC', 'b', 'power', b.ports[0])];
  const v = part.rot === 90, [a, c] = v ? (['t', 'b'] as const) : (['l', 'r'] as const);
  const names = k === 'dio' || k === 'led' ? ['A', 'K'] : ['1', '2'];
  const keep = b.ports.length === 2 ? b.ports : [];
  return [pin(names[0], a, 'io', keep[0]), pin(names[1], c, 'io', keep[1])];
}

/** A new part block centred at (x, y) — V2 shape(): title = the part name, no reference. */
export function makePart(kind: PartKind, at: { x: number; y: number }, title: string): Block {
  const item = partItem(kind)!;
  const part: Part = { kind, rot: 0, size: 'M' };
  const [w, h] = partSize(kind, part.size, part.rot);
  const b: Block = {
    id: uid(), x: at.x - w / 2, y: at.y - h / 2, w, h,
    title, subtitle: '', partNumber: kind === 'vcc' ? item.value ?? '' : '', ref: '',
    ports: [], style: {}, sizing: 'auto', showTitle: true, locked: false, metrics: {}, part,
  };
  b.ports = symbolPins(b, part);
  return b;
}

/** Change size / direction of a part, keeping its centre and its pins (wires stay attached). */
export function reshapePart(d: BlockDiagram, id: string, patch: Partial<Pick<Part, 'size' | 'rot'>>): BlockDiagram {
  return {
    ...d,
    blocks: d.blocks.map(b => {
      if (b.id !== id || !b.part) return b;
      const part: Part = { ...b.part, ...patch };
      if (!isTwoPin(part.kind)) part.rot = 0;
      const [w, h] = partSize(part.kind, part.size, part.rot);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const nb: Block = { ...b, part, w, h, x: cx - w / 2, y: cy - h / 2 };
      nb.ports = symbolPins(nb, part);
      return nb;
    }),
  };
}

/** A supply symbol's value is also its pin name (V2 placeSymbolPins). */
export function setPartValue(d: BlockDiagram, id: string, value: string): BlockDiagram {
  return {
    ...d,
    blocks: d.blocks.map(b => {
      if (b.id !== id) return b;
      const nb: Block = { ...b, partNumber: value };
      if (b.part?.kind === 'vcc') nb.ports = symbolPins(nb, b.part);
      return nb;
    }),
  };
}

// ------------------------------------------------------------------ voltage badges

/** "3v3" → "3.3V", "+5" → "5V", "05V" → "5V"; at most 10 characters (V2 normRail). */
export function normRail(s: string): string {
  let v = String(s || '').trim().replace(/\s+/g, '').replace(/[vV]$/, 'V').replace(/^\+/, '');
  if (!v) return '';
  const m = /^(-?\d+)[vV](\d+)$/.exec(v);
  if (m) v = `${m[1]}.${m[2]}V`;
  if (/^-?\d+(\.\d+)?$/.test(v)) v += 'V';
  if (/^-?\d+(\.\d+)?V$/.test(v)) v = String(Number(v.slice(0, -1))) + 'V';
  return v.slice(0, 10);
}
/** Unique, normalised, at most four (V2 cleanRails). */
export const cleanRails = (a: readonly string[] | undefined) => [...new Set((a ?? []).map(normRail).filter(Boolean))].slice(0, 4);

const level = (s: string): number | null => {
  const x = parseFloat(String(s).replace(/[^\d.-]/g, ''));
  return Number.isFinite(x) && /\d/.test(s) ? x : null;
};
/** Colour band of a voltage (V2 railColor thresholds) → token suffix --rail-<band>. */
export function railBand(s: string): 'unknown' | 'negative' | 'core' | 'io' | 'logic' | 'mid' | 'high' {
  const v = level(s);
  if (v === null) return 'unknown';
  if (v < 0) return 'negative';
  if (v < 1.5) return 'core';
  if (v < 2.6) return 'io';
  if (v < 4.2) return 'logic';
  if (v < 7) return 'mid';
  return 'high';
}

// ------------------------------------------------------------------ drawing

export const BADGE = Object.freeze({ height: 22, top: -9, right: 13, gap: 4, padLeft: 7, padRight: 10, icon: 12, iconGap: 3, font: 12 });
const BOLT = 'M13 2L4 14h7l-1 8 9-12h-7z';
const LABEL = Object.freeze({ font: 12, lineHeight: 14.4, above: 3, railBelowTop: 14, sideGap: 6 });

/** Symbol drawing for a part block, in diagram coordinates. */
export function partNode(b: Block): VNode | null {
  const part = b.part;
  if (!part || !(part.kind in GLYPH)) return null;
  const k = part.kind as PartKind;
  const [vw, vh] = SYM_BOX[k] ?? (part.rot === 90 ? [40, 100] : [100, 40]);
  const shapes = GLYPH[k].map(([tag, attrs]) => h(tag, attrs));
  const body = part.rot === 90 && isTwoPin(k) ? [h('g', { transform: 'translate(40 0) rotate(90)' }, shapes)] : shapes;
  const sx = b.w / vw, sy = b.h / vh;
  const glyph = h('g', {
    class: 'af-part-glyph', transform: `translate(${r2(b.x)},${r2(b.y)}) scale(${r2(sx * 1000) / 1000},${r2(sy * 1000) / 1000})`,
    'stroke-width': r2((1.8 / Math.sqrt(sx * sy)) * 100) / 100,
  }, body);
  const value = k === 'gnd' ? '' : b.partNumber;
  let label: VNode | null = null;
  if (value) {
    const vertical = part.rot === 90 && isTwoPin(k);
    const cls = `af-part-value${k === 'vcc' ? ` af-rail-${railBand(value)}` : ''}`;
    if (vertical) {
      label = h('text', { class: cls, x: r2(b.x + b.w + LABEL.sideGap), y: r2(b.y + b.h / 2), 'dominant-baseline': 'central' }, value);
    } else {
      const bottom = k === 'vcc' ? b.y + LABEL.railBelowTop : b.y - LABEL.above;
      label = h('text', { class: cls, x: r2(b.x + b.w / 2), y: r2(bottom - LABEL.lineHeight / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, value);
    }
  }
  return h('g', { class: 'af-part-symbol' }, [glyph, label]);
}

/** Width of one badge for a rail text. */
export const badgeWidth = (text: string, measure: Measure = estimateWidth) =>
  BADGE.padLeft + BADGE.icon + BADGE.iconGap + measure(text, BADGE.font, true, false) + BADGE.padRight;

/** Voltage badges on the top-right edge of a plain block (right-aligned, in order). */
export function badgesNode(b: Block, measure: Measure = estimateWidth): VNode | null {
  const rails = cleanRails(b.rails);
  if (b.part || !rails.length) return null;
  const widths = rails.map(r => badgeWidth(r, measure));
  let x = b.x + b.w - BADGE.right - widths.reduce((s, w) => s + w, 0) - BADGE.gap * (rails.length - 1);
  const y = b.y + BADGE.top;
  return h('g', { class: 'af-rails' }, rails.map((r, i) => {
    const w = widths[i], x0 = x;
    x += w + BADGE.gap;
    const iconX = x0 + BADGE.padLeft, iconY = y + (BADGE.height - BADGE.icon) / 2;
    return h('g', { class: `af-rail af-rail-${railBand(r)}` }, [
      h('rect', { class: 'af-rail-pill', x: r2(x0 + 0.5), y: r2(y + 0.5), width: r2(w - 1), height: BADGE.height - 1, rx: (BADGE.height - 1) / 2 }),
      h('path', { class: 'af-rail-bolt', d: BOLT, transform: `translate(${r2(iconX)},${r2(iconY)}) scale(0.5)` }),
      h('text', { class: 'af-rail-text', x: r2(iconX + BADGE.icon + BADGE.iconGap), y: r2(y + BADGE.height / 2), 'dominant-baseline': 'central' }, r),
    ]);
  }));
}

/** Extra bounds of badges (above the block) and supply labels, for export bounds. */
export function decorationBounds(b: Block, measure: Measure = estimateWidth): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const rails = cleanRails(b.rails);
  if (!b.part && rails.length) {
    const total = rails.reduce((s, r) => s + badgeWidth(r, measure), 0) + BADGE.gap * (rails.length - 1);
    out.push({ x: b.x + b.w - BADGE.right - total, y: b.y + BADGE.top, w: total, h: BADGE.height });
  }
  if (b.part && b.part.kind !== 'gnd' && b.partNumber && !(b.part.rot === 90 && isTwoPin(b.part.kind)) && b.part.kind !== 'vcc') {
    const w = measure(b.partNumber, LABEL.font, true, false);
    out.push({ x: b.x + b.w / 2 - w / 2, y: b.y - LABEL.above - LABEL.lineHeight, w, h: LABEL.lineHeight });
  }
  return out;
}

const VALUE_UNIT: Partial<Record<string, string>> = { res: 'Ω', bead: 'Ω', cap: 'F', capp: 'F', ind: 'H', fuse: 'A', xtal: 'Hz', vcc: 'V' };

/**
 * A part's value tidied as V2 did (normValue, legacy L4268): "u" → "µ", "4.7k" / "4.7 kohm" →
 * "4.7kΩ", a bare number with an SI prefix gets the part's unit (Ω, F, H, A, Hz, V; a crystal
 * "32.768k" → "32.768kHz"); a supply's value is a rail ("3v3" → "3.3V"); at most 24 characters.
 */
export function normValue(kind: string, v: string): string {
  const unit = VALUE_UNIT[kind];
  let s = String(v || '').trim().replace(/(\d)\s*u(?=[FHA]?$|$)/i, '$1µ');
  // "4.7k" → "4.7kΩ": V2 did this for every kind (a crystal's "32.768k" became "32.768kΩ");
  // V3 only for parts measured in ohms, for unknown kinds, or with "ohm" written out
  s = s.replace(/(\d)\s*([kKmM])\s*(ohm|Ω)?$/, (all: string, d: string, u: string, ohm?: string) =>
    (unit === 'Ω' || ohm || !unit ? `${d}${u === 'K' ? 'k' : u}Ω` : all));
  if (!s) return s;
  if (unit && /^\d+(\.\d+)?\s*[pnµmkKMG]?$/.test(s)) s = s.replace(/\s+/g, '') + (kind === 'xtal' && /[kKM]$/.test(s) ? 'Hz' : unit);
  if (kind === 'vcc') s = normRail(s) || s;
  return s.slice(0, 24);
}
