// Export a block diagram as a standalone SVG. The drawing is the canvas drawing — the same
// render/* VNodes — without selection or editing overlays, with canvas.css and the design
// tokens written onto the elements as presentation attributes (inline-style.ts).
//
// V2: exportSvgDocument L390 (bounds of blocks, wires, texts + 48 px margin, white background
// unless transparent, defs copied from the canvas) and its clean-up layers — L1469 redraw
// wires / clean look, L1567 drop grid handles, L1674 drop selection, L1744 drop label leaders,
// L1856 drop mark outlines. V3 never draws those overlays into an export, so the clean-up
// layers have nothing to remove. Schedule export (L754) belongs to designs/schedule (3.29).
import type { BlockDiagram, BlockView } from '../io/schema-types';
import { blocksLayer, type BlockRenderOptions } from '../render/blocks';
import { wiresLayer } from '../render/wires';
import { framesLayer, frameTab } from '../render/frames';
import { textLayout, textsLayer, estimateWidth, type Measure } from '../render/texts';
import { h, toMarkup, SVG_NS, type VNode } from '../render/vnode';
import { routeAll, type Route } from '../router/full-path';
import { ExportError } from './errors';
import { inlineStyles, parseRules, parseTokens, type Theme } from './inline-style';
import { safeFileName } from '../io/project-file';
import tokensCss from '../styles/tokens.css?raw';
import canvasCss from '../styles/canvas.css?raw';

export const EXPORT_MARGIN = 48;

export interface Bounds { x: number; y: number; w: number; h: number }

export { ExportError } from './errors';

export interface ExportContext { data: BlockDiagram; routes: ReadonlyMap<string, Route>; measure: Measure }

export interface SvgExportOptions {
  /** No background rectangle (V2 "transparent background"). */
  transparent?: boolean;
  /** Colour theme of the exported drawing (default light, as V2). */
  theme?: Theme;
  /** Text measuring (canvasMeasure in the browser; an estimate elsewhere). */
  measure?: Measure;
  /** Design-specific drawing (frames, part symbols …: DesignModule.exportExtras, 3.24 on). */
  extras?: (ctx: ExportContext) => { below?: VNode[]; above?: VNode[]; bounds?: Bounds[] };
  /** Extra drawing on blocks (DesignModule.decorate). */
  decorate?: BlockRenderOptions['decorate'];
  /** Strip along the bottom of blocks (DesignModule.blockFooter). */
  footer?: (b: import('../io/schema-types').Block, d: BlockDiagram, measure: Measure) => { height: number; node: VNode } | null;
  /** Draw in this view instead of the diagram's own (export dialog choice, plan §2.2.1). */
  view?: BlockView;
  /** Routes already computed for this data (the canvas has them). */
  routes?: ReadonlyMap<string, Route>;
}

export interface SvgExport {
  source: string;
  width: number;
  height: number;
  /** viewBox x, y, w, h in diagram coordinates. */
  viewBox: [number, number, number, number];
  /** The (styled) drawing, for page layout (page.ts). */
  defs: VNode[];
  content: VNode[];
  background?: string;
}

/** Union of everything drawn (blocks, wire routes, junctions, text boxes, frames, extras). */
export function contentBounds(d: BlockDiagram, routes: ReadonlyMap<string, Route>, measure: Measure = estimateWidth, extra: Bounds[] = []): Bounds | null {
  const boxes: Bounds[] = [...extra];
  for (const b of d.blocks) boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  for (const t of d.texts) boxes.push({ x: t.x, y: t.y, w: t.w, h: textLayout(t, measure).height });
  for (const f of d.frames) boxes.push({ x: f.x, y: f.y, w: f.w, h: f.h }, frameTab(f, measure));
  for (const j of d.junctions) boxes.push({ x: j.x - 5, y: j.y - 5, w: 10, h: 10 });
  for (const r of routes.values()) for (const p of r.ps) boxes.push({ x: p.x, y: p.y, w: 0, h: 0 });
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}

const rulesCache = new Map<string, ReturnType<typeof parseRules>>();
const varsCache = new Map<Theme, Map<string, string>>();
function stylesFor(theme: Theme) {
  if (!rulesCache.has('canvas')) rulesCache.set('canvas', parseRules(canvasCss));
  if (!varsCache.has(theme)) varsCache.set(theme, parseTokens(tokensCss, theme));
  return { rules: rulesCache.get('canvas')!, vars: varsCache.get(theme)! };
}

/** Resolve the canvas styling of a drawing for a theme (used by export and its tests). */
export function styleDrawing(n: VNode, theme: Theme = 'light'): VNode {
  return inlineStyles(n, stylesFor(theme));
}

/** Canvas-only elements left out of exports (V2 exports never drew port dots). */
export const EXPORT_HIDDEN = ['af-port-dot'];

function prune(n: VNode): VNode {
  return {
    ...n,
    children: n.children
      .filter(c => !String(c.attrs.class ?? '').split(/\s+/).some(x => EXPORT_HIDDEN.includes(x)))
      .map(prune),
  };
}

/** Split <defs> out of a styled layer tree (markers go to the root defs). */
function splitDefs(n: VNode, defs: VNode[]): VNode {
  return { ...n, children: n.children.filter(c => (c.tag === 'defs' ? (defs.push(...c.children), false) : true)).map(c => splitDefs(c, defs)) };
}

export function exportSvg(data: BlockDiagram, o: SvgExportOptions = {}): SvgExport {
  // the view only changes the drawing, never positions or routes
  const d = o.view && o.view !== data.view ? { ...data, view: o.view } : data;
  if (!d.blocks.length && !d.texts.length) throw new ExportError('empty');
  const measure = o.measure ?? estimateWidth;
  const theme = o.theme ?? 'light';
  const routes = o.routes ?? routeAll(d);
  const extra = o.extras?.({ data: d, routes, measure }) ?? {};
  const box = contentBounds(d, routes, measure, extra.bounds)!;
  const left = Math.floor(box.x - EXPORT_MARGIN), top = Math.floor(box.y - EXPORT_MARGIN);
  const width = Math.max(1, Math.ceil(box.x + box.w + EXPORT_MARGIN) - left);
  const height = Math.max(1, Math.ceil(box.y + box.h + EXPORT_MARGIN) - top);

  // V2 order: frames (L4433 "frames go first") and decorations below, wires, blocks, free text on top
  const drawing = h('g', { class: 'af-export' }, [
    framesLayer(d.frames, { measure }),
    ...(extra.below ?? []),
    wiresLayer(d, routes),
    blocksLayer(d, { theme: d.theme, decorate: o.decorate, footer: o.footer && ((b, x) => o.footer!(b, x, measure)) }),
    textsLayer(d.texts, { measure }),
    ...(extra.above ?? []),
  ]);
  const defs: VNode[] = [];
  const styled = splitDefs(styleDrawing(prune(drawing), theme), defs);
  const { vars } = stylesFor(theme);
  const background = o.transparent ? undefined : vars.get('--color-surface');
  const root = h('svg', {
    xmlns: SVG_NS, version: '1.1', width, height, viewBox: `${left} ${top} ${width} ${height}`,
  }, [
    defs.length ? h('defs', {}, defs) : null,
    background ? h('rect', { x: left, y: top, width, height, fill: background }) : null,
    ...styled.children,
  ]);
  return {
    source: toMarkup(root), width, height, viewBox: [left, top, width, height],
    defs, content: styled.children, background,
  };
}


/**
 * Export a drawing of a canvas design that draws itself (DesignModule.canvas: schedule) — the
 * same styling as block diagrams; `bounds` already include the design's margins (V2 schedule
 * export L754: viewBox = graphBounds, width / height rounded up, white background).
 */
export function exportDrawing(node: VNode, bounds: Bounds | null, o: { transparent?: boolean; theme?: Theme } = {}): SvgExport {
  if (!bounds) throw new ExportError('empty');
  const theme = o.theme ?? 'light';
  const left = bounds.x, top = bounds.y, width = Math.max(1, Math.ceil(bounds.w)), height = Math.max(1, Math.ceil(bounds.h));
  const defs: VNode[] = [];
  const styled = splitDefs(styleDrawing(prune(h('g', { class: 'af-export' }, [node])), theme), defs);
  const background = o.transparent ? undefined : stylesFor(theme).vars.get('--color-surface');
  const root = h('svg', { xmlns: SVG_NS, version: '1.1', width, height, viewBox: `${left} ${top} ${width} ${height}` }, [
    defs.length ? h('defs', {}, defs) : null,
    background ? h('rect', { x: left, y: top, width, height, fill: background }) : null,
    ...styled.children,
  ]);
  return { source: toMarkup(root), width, height, viewBox: [left, top, width, height], defs, content: styled.children, background };
}

/** Download name of an export: "<project> - <design>.<ext>" made file-system safe. */
export function exportFileName(projectName: string, designName: string, ext: 'svg' | 'png'): string {
  const base = [projectName.trim(), designName.trim()].filter(Boolean).join(' - ');
  return `${safeFileName(base)}.${ext}`;
}
