// Wires, junctions and wire labels as SVG (read-only on the model). Routes come from
// router/full-path (computed once per frame by the caller and passed in).
//
// V2: drawEdges L299–302 (path, arrow marker, invalid in red, label on the longest segment),
// drawJunctions L356 (+ look L1081), edgeLabel L349 / L1442 (µA from p13Current), p13 label look L1465 (size, weight, halo), line format
// dashes L1400. Label de-duplication (L3099) and manual label marks dragging belong to
// interaction (3.20).
import type { BlockDiagram, BlockView, LineFormat, Wire } from '../io/schema-types';
import { near, toPathData, type Point } from '../core/geometry';
import type { Route } from '../router/full-path';
import { h, r2, type VNode } from './vnode';

export const DASH: Record<string, string | undefined> = { solid: undefined, dash: '8 5', dot: '2 4' };
const KINDS = new Set(['signal', 'power', 'clock', 'bus']);
export const LABEL_SIZE = 14;

/** Text of a wire's label: name, plus voltage / current when shown (V2 edgeLabel) — only in
 *  the power view; the function view draws power wires without their values (plan §2.2.1). */
export function wireLabel(w: Wire, view: BlockView): string {
  const parts = [w.name];
  const e = w.electrical;
  if (e?.show && view === 'power') {
    if (e.voltage) parts.push(/[a-z]$/i.test(e.voltage) ? e.voltage : `${e.voltage} V`);
    if (e.current) parts.push(/[a-z]$/i.test(e.current) ? e.current : `${e.current} ${e.unit === 'uA' ? '\u00b5A' : e.unit ?? 'A'}`);
  }
  return parts.filter(Boolean).join(' · ');
}

/** Where the label goes: the manual mark, else above the middle of the longest segment. */
export function labelPosition(w: Wire, ps: readonly Point[]): { x: number; y: number; anchor: 'middle' | 'start' } | null {
  if (w.label?.mark) return { x: w.label.mark.x, y: w.label.mark.y, anchor: 'middle' };
  if (ps.length < 2) return null;
  let longest = -1, li = 0;
  for (let i = 0; i < ps.length - 1; i++) {
    const l = Math.abs(ps[i].x - ps[i + 1].x) + Math.abs(ps[i].y - ps[i + 1].y);
    if (l > longest) { longest = l; li = i; }
  }
  const a = ps[li], b = ps[li + 1], horizontal = near(a.y, b.y);
  return { x: (a.x + b.x) / 2 + (horizontal ? 0 : 8), y: (a.y + b.y) / 2 - 7, anchor: horizontal ? 'middle' : 'start' };
}

/** Marker id for an arrow of a colour and size (one <marker> per combination). */
export const markerId = (color: string, size: number) => `af-arrow-${(color || 'kind').replace(/[^a-zA-Z0-9]/g, '')}-${r2(size)}`;

function strokeOf(w: Wire): { cls: string; color?: string } {
  const kind = KINDS.has(w.kind) ? w.kind : 'signal';
  return { cls: `af-wire af-wire-${kind}`, color: w.line.color || undefined };
}

export interface WireRenderOptions { selected?: ReadonlySet<string> }

/** In the power view everything but power wires is drawn faded (plan §2.2.1). */
export const isMuted = (w: Wire, view: BlockView) => view === 'power' && w.kind !== 'power';

function wireNode(w: Wire, route: Route, view: BlockView, markers: Map<string, LineFormat & { kindColor: string }>, opts: WireRenderOptions): VNode {
  const s = strokeOf(w), d = toPathData(route.ps);
  // an arrow never points into a junction; `bothEnds` adds one at the start (V2 edge.afBoth, L4112)
  const arrowEnd = w.line.arrow && !('junction' in w.b);
  const arrowStart = w.line.arrow && !!w.line.bothEnds && !('junction' in w.a);
  let marker: string | undefined, markerStart: string | undefined;
  if ((arrowEnd || arrowStart) && route.valid) {
    const id = markerId(w.line.color, w.line.arrowSize ?? 9);
    markers.set(id, { ...w.line, kindColor: s.cls.split(' ')[1] });
    if (arrowEnd) marker = `url(#${id})`;
    if (arrowStart) markerStart = `url(#${id})`;
  }
  const style = [s.color && `stroke:${s.color}`, w.line.width && `stroke-width:${w.line.width}px`].filter(Boolean).join(';') || undefined;
  const text = wireLabel(w, view), pos = text ? labelPosition(w, route.ps) : null;
  return h('g', { class: `af-wire-group${route.valid ? '' : ' is-invalid'}${isMuted(w, view) ? ' is-muted' : ''}${opts.selected?.has(w.id) ? ' is-selected' : ''}`, 'data-wire': w.id }, [
    opts.selected?.has(w.id) ? h('path', { class: 'af-wire-selected', d }) : null,
    h('path', { class: s.cls, d, style, 'stroke-dasharray': DASH[w.line.dash], 'marker-end': marker, 'marker-start': markerStart }),
    pos ? h('text', {
      class: 'af-wire-label', x: r2(pos.x), y: r2(pos.y), 'text-anchor': pos.anchor,
      style: w.label?.size && w.label.size !== LABEL_SIZE ? `font-size:${w.label.size}px` : undefined,
    }, text) : null,
  ]);
}

/** Arrow markers used by the wires (colour = the wire's own, else its kind token). */
function markerDefs(markers: Map<string, LineFormat & { kindColor: string }>): VNode | null {
  if (!markers.size) return null;
  return h('defs', {}, [...markers].map(([id, f]) => h('marker', {
    id, viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: r2(f.arrowSize ?? 9), markerHeight: r2(f.arrowSize ?? 9),
    markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse',
  }, [h('path', { d: 'M0 0L10 5L0 10z', class: `af-arrow ${f.kindColor}`, style: f.color ? `fill:${f.color}` : undefined })])));
}

/** Wires (in model order) with their markers, then junction dots on top. Labels and fading
 *  follow `d.view`. */
export function wiresLayer(d: BlockDiagram, routes: ReadonlyMap<string, Route>, opts: WireRenderOptions = {}): VNode {
  const markers = new Map<string, LineFormat & { kindColor: string }>();
  const wires = d.wires.filter(w => routes.has(w.id)).map(w => wireNode(w, routes.get(w.id)!, d.view, markers, opts));
  return h('g', { class: 'af-wires' }, [
    markerDefs(markers),
    ...wires,
    h('g', { class: 'af-junctions' }, d.junctions.map(j => h('circle', {
      class: `af-junction${opts.selected?.has(j.id) ? ' is-selected' : ''}`, 'data-junction': j.id, cx: r2(j.x), cy: r2(j.y), r: 5,
    }))),
  ]);
}

/** Number of wires whose route is not valid (for the V2-style status message). */
export const invalidCount = (routes: ReadonlyMap<string, Route>) => [...routes.values()].filter(r => !r.valid).length;
