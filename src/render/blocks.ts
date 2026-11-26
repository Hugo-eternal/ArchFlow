// Blocks and their ports as SVG (read-only on the model). Geometry comes straight from the
// model — block x / y / w / h, ports from core/grid.portPoint — so what is drawn is exactly
// what the router routes around (V2 measured HTML boxes; see CHANGELOG, 3.16).
//
// V2: render L308 (block DOM), placePorts L305, applyBlockAppearance, appendMetrics, the
// title-layout layers (af15 L3062 nine-grid titles) and the export look (exportSvgDocument).
// Part symbols, connectors and LCD templates (designs/function, 3.25–3.26) draw on top of
// this through `decorate`.
import type { Block, BlockDiagram, Metric, MetricKey, Port, Theme } from '../io/schema-types';
import { gridSize, portPoint } from '../core/grid';
import { h, r2, type VNode } from './vnode';

export interface BlockRenderOptions {
  /** Ids of selected blocks (drawn with a selection outline). */
  selected?: ReadonlySet<string>;
  /** Diagram theme (fonts and sizes) — falls back to the token defaults. */
  theme?: Theme;
  /** Extra drawing for a block (part symbols, connector pins …) added after the body. */
  decorate?: (b: Block, d: BlockDiagram) => VNode | null;
}

export const PORT_LABEL_GAP = 8;       // label distance from the port centre, inside the block
export const PORT_LABEL_OUTSIDE = 13;  // … outside the block (V2 placePorts: 13 px)
export const BLOCK_PAD = 12;
const METRIC_ORDER: MetricKey[] = ['voltage', 'current', 'power', 'efficiency'];
const METRIC_UNIT: Record<MetricKey, string> = { voltage: 'V', current: 'A', power: 'W', efficiency: '%' };

/** Style overrides of one block as CSS custom properties (user colours are data, not CSS). */
function styleOf(b: Block): string | undefined {
  const s = b.style, parts: string[] = [];
  if (s.fill) parts.push(`--block-fill:${s.fill}`);
  if (s.border) parts.push(`--block-border:${s.border}`);
  if (s.accent) parts.push(`--block-accent:${s.accent}`);
  if (s.text) parts.push(`--block-text:${s.text}`);
  if (s.subtitle) parts.push(`--block-subtitle:${s.subtitle}`);
  return parts.length ? parts.join(';') : undefined;
}

/** Text lines of a block: [title, second line, subtitle] (V2 head / .part-number / desc). */
export function blockLines(b: Block): { title: string; second: string; subtitle: string } {
  return {
    title: b.showTitle ? (b.partNumber || b.title) : '',
    second: b.partNumber && b.title ? b.title : '',
    subtitle: b.subtitle,
  };
}

export function metricText(key: MetricKey, m: Metric): string {
  const v = m.value.trim();
  if (!v) return '';
  if (/[a-z%]$/i.test(v)) return v;
  return key === 'efficiency' ? `${v}%` : `${v} ${key === 'current' && m.unit ? m.unit : METRIC_UNIT[key]}`;
}

function titleLayout(b: Block): { x: number; anchor: 'start' | 'middle' | 'end'; top: boolean } {
  const align = b.titleAlign ?? 'center-center';
  const [v, hz] = align.split('-') as ['top' | 'center', 'left' | 'center' | 'right'];
  const x = hz === 'left' ? b.x + BLOCK_PAD : hz === 'right' ? b.x + b.w - BLOCK_PAD : b.x + b.w / 2;
  return { x, anchor: hz === 'left' ? 'start' : hz === 'right' ? 'end' : 'middle', top: v === 'top' };
}

function portNode(b: Block, p: Port, g: number | undefined, connected: boolean): VNode {
  const c = portPoint(b, p, g);
  const label = p.label === 'hidden' || !p.name ? null : (() => {
    const out = p.label === 'outside', gap = out ? PORT_LABEL_OUTSIDE : PORT_LABEL_GAP;
    // inside: towards the block centre; outside: away from it
    const sign = out ? 1 : -1;
    const dx = p.side === 'l' ? -sign : p.side === 'r' ? sign : 0, dy = p.side === 't' ? -sign : p.side === 'b' ? sign : 0;
    const anchor = dx < 0 ? 'end' : dx > 0 ? 'start' : 'middle';
    return h('text', {
      class: 'af-port-label', x: r2(c.x + dx * gap), y: r2(c.y + dy * gap), 'text-anchor': anchor,
      'dominant-baseline': dy < 0 ? 'auto' : dy > 0 ? 'hanging' : 'central',
    }, p.name);
  })();
  return h('g', { class: 'af-port', 'data-port': p.id, 'data-side': p.side, 'data-connected': connected ? 'true' : 'false' }, [
    h('circle', { class: 'af-port-dot', cx: r2(c.x), cy: r2(c.y), r: 3.5 }),
    label,
  ]);
}

/** One block: body, accent bar, text, metrics, ports. */
export function blockNode(b: Block, d: BlockDiagram, opts: BlockRenderOptions = {}, connected: ReadonlySet<string> = new Set()): VNode {
  const g = d.grid?.snap ? gridSize(d.grid) : undefined;
  const lines = blockLines(b), lay = titleLayout(b);
  const titleSize = b.style.titleSize ?? opts.theme?.title;
  const subSize = b.font?.subtitle ?? opts.theme?.subtitle;
  // voltage / current / power / efficiency belong to the power view (plan §2.2.1)
  const metrics = d.view !== 'power' ? [] : METRIC_ORDER.map(k => (b.metrics[k]?.show ? metricText(k, b.metrics[k]!) : '')).filter(Boolean);
  const rows: { text: string; cls: string; size: number | undefined; height: number }[] = [];
  const sub = subSize ?? 13;
  if (lines.title) rows.push({ text: lines.title, cls: 'af-block-title', size: titleSize, height: (titleSize ?? 20) * 1.25 });
  for (const tx of [lines.second, lines.subtitle]) if (tx) rows.push({ text: tx, cls: 'af-block-subtitle', size: subSize, height: sub * 1.35 });
  if (metrics.length) rows.push({ text: metrics.join(' · '), cls: 'af-block-metric', size: b.font?.metric ?? opts.theme?.metric, height: sub * 1.35 });
  const isPart = !!b.part;

  // stack the rows around the vertical centre (or from the top)
  const total = rows.reduce((n, r) => n + r.height, 0);
  let y = lay.top ? b.y + BLOCK_PAD : b.y + b.h / 2 - total / 2;
  // a part (schematic symbol) shows no title / reference: its value is drawn by decorate (V2 L3986)
  const textNodes = isPart ? [] : rows.map(row => {
    // a per-block size goes in style: a presentation attribute would lose to the CSS class
    const node = h('text', {
      class: row.cls, x: r2(lay.x), y: r2(y + row.height / 2), 'text-anchor': lay.anchor, 'dominant-baseline': 'central',
      style: row.size ? `font-size:${row.size}px` : undefined,
    }, row.text);
    y += row.height;
    return node;
  });

  return h('g', {
    class: `af-block${isPart ? ' af-part' : ''}${opts.selected?.has(b.id) ? ' is-selected' : ''}${b.locked ? ' is-locked' : ''}`,
    'data-block': b.id, style: styleOf(b),
  }, [
    isPart ? null : h('rect', { class: 'af-block-body', x: r2(b.x), y: r2(b.y), width: r2(b.w), height: r2(b.h), rx: 7 }),
    isPart ? null : h('path', { class: 'af-block-accent', d: `M${r2(b.x + 5)},${r2(b.y + 2)}H${r2(b.x + b.w - 5)}` }),
    b.ref && !isPart ? h('text', { class: 'af-block-ref', x: r2(b.x + 8), y: r2(b.y + 16) }, b.ref) : null,
    ...textNodes,
    opts.decorate?.(b, d) ?? null,
    ...b.ports.map(p => portNode(b, p, g, connected.has(`${b.id}/${p.id}`))),
    opts.selected?.has(b.id) ? h('rect', { class: 'af-block-selection', x: r2(b.x - 4), y: r2(b.y - 4), width: r2(b.w + 8), height: r2(b.h + 8), rx: 9 }) : null,
  ]);
}

/** All blocks of a diagram, in model order (later blocks on top, as in V2). */
export function blocksLayer(d: BlockDiagram, opts: BlockRenderOptions = {}): VNode {
  const connected = new Set<string>();
  for (const w of d.wires) for (const e of [w.a, w.b]) if ('block' in e) connected.add(`${e.block}/${e.port}`);
  return h('g', { class: 'af-blocks' }, d.blocks.map(b => blockNode(b, d, opts, connected)));
}
