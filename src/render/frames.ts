// Area frames (V2.4.0 L4288–L4450): a rounded outline (dashed, solid or shaded) with a name tab
// on its top edge, drawn below wires and blocks. Geometry from V2.10.1's export (L4436) and CSS
// (.af40-frame / .af40-tab): outline rx 10, stroke 1.5; tab 26 px high, 17 px from the left
// edge, centred on the top edge, 12 px padding, name 13 px / 600.
import type { Frame } from '../io/schema-types';
import { h, r2, type VNode } from './vnode';
import { estimateWidth, type Measure } from './texts';

export const FRAME_TAB = Object.freeze({ left: 17, height: 26, pad: 12, font: 13 });
const COLORS = ['teal', 'blue', 'amber', 'gray'];
const STYLES = ['dash', 'solid', 'fill'];

/** The name tab of a frame (diagram coordinates); shared by drawing, hit testing and export bounds. */
export function frameTab(f: Frame, measure: Measure = estimateWidth): { x: number; y: number; w: number; h: number } {
  const text = f.title || ' ';
  const w = Math.min(f.w - 2 * FRAME_TAB.left, measure(text, FRAME_TAB.font, true, false) + 2 * FRAME_TAB.pad);
  return { x: f.x + FRAME_TAB.left, y: f.y - FRAME_TAB.height / 2 + 1, w: Math.max(2 * FRAME_TAB.pad, w), h: FRAME_TAB.height };
}

export interface FrameRenderOptions { selected?: ReadonlySet<string>; measure?: Measure }

export function frameNode(f: Frame, opts: FrameRenderOptions = {}): VNode {
  const color = COLORS.includes(f.color) ? f.color : 'teal', style = STYLES.includes(f.style) ? f.style : 'dash';
  const tab = frameTab(f, opts.measure), sel = opts.selected?.has(f.id);
  return h('g', { class: `af-frame af-frame-${color} af-frame-${style}${sel ? ' is-selected' : ''}`, 'data-frame': f.id }, [
    h('rect', { class: 'af-frame-box', x: r2(f.x), y: r2(f.y), width: r2(f.w), height: r2(f.h), rx: 10 }),
    h('rect', { class: 'af-frame-tab', x: r2(tab.x), y: r2(tab.y), width: r2(tab.w), height: tab.h, rx: 6 }),
    h('text', { class: 'af-frame-name', x: r2(tab.x + FRAME_TAB.pad), y: r2(tab.y + tab.h / 2), 'dominant-baseline': 'central' }, f.title),
    sel ? h('rect', { class: 'af-frame-selection', x: r2(f.x - 3), y: r2(f.y - 3), width: r2(f.w + 6), height: r2(f.h + 6), rx: 12 }) : null,
    ...(sel ? [[f.x, f.y], [f.x + f.w, f.y], [f.x, f.y + f.h], [f.x + f.w, f.y + f.h]].map(([x, y]) =>
      h('rect', { class: 'af-frame-handle', x: r2(x - 5), y: r2(y - 5), width: 10, height: 10, rx: 2 })) : []),
  ]);
}

/** All frames, below everything else. */
export function framesLayer(frames: readonly Frame[], opts: FrameRenderOptions = {}): VNode {
  return h('g', { class: 'af-frames' }, frames.map(f => frameNode(f, opts)));
}
