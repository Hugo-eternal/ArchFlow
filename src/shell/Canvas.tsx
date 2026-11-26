// The block-diagram canvas: one <svg>. The drawing is render/* VNodes mounted on every change
// (the draft while dragging); pointer input goes to interaction/gestures, the wheel zooms.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../core/i18n';
import { backgroundOf } from '../core/camera';
import { gridSize } from '../core/grid';
import { blocksLayer } from '../render/blocks';
import { wiresLayer, invalidCount } from '../render/wires';
import { textsLayer } from '../render/texts';
import { framesLayer } from '../render/frames';
import { h, mount, r2, type VNode } from '../render/vnode';
import type { PointerIn } from '../interaction/gestures';
import type { Shell } from './controller';
import { useVersion } from './use-store';

const pointer = (svg: SVGSVGElement, e: { clientX: number; clientY: number; button: number; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): PointerIn => {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, button: e.button, shift: e.shiftKey, mod: e.metaKey || e.ctrlKey, alt: e.altKey };
};

function overlay(shell: Shell): VNode | null {
  const p = shell.gestures.preview;
  if (!p) return null;
  if (p.kind === 'box') return h('rect', { class: 'af-box-select', x: r2(p.rect.x), y: r2(p.rect.y), width: r2(p.rect.w), height: r2(p.rect.h) });
  return h('g', { class: 'af-wire-preview' }, [
    h('path', { d: `M${r2(p.from.x)},${r2(p.from.y)} L${r2(p.to.x)},${r2(p.to.y)}` }),
    p.target ? h('circle', { cx: r2(p.target.x), cy: r2(p.target.y), r: 7 }) : null,
  ]);
}

export function Canvas({ shell }: { shell: Shell }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const version = useVersion(shell.store) + useVersion(shell.ui) * 1e-6;

  // keep the viewport size for fit / zoom / new items
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const size = () => {
      shell.setViewport({ w: svg.clientWidth, h: svg.clientHeight });
      if (shell.pendingFit && svg.clientWidth > 0) { shell.pendingFit = false; shell.fitView(); }
    };
    const ro = new ResizeObserver(size);
    ro.observe(svg);
    size();
    const wheel = (e: WheelEvent) => { e.preventDefault(); const p = pointer(svg, { ...e, button: 0 }); shell.gestures.wheel(e.deltaY, p); };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); svg.removeEventListener('wheel', wheel); };
  }, [shell]);

  // draw
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !shell.isBlockDiagram) return;
    const d = shell.gestures.draft();
    const routes = shell.routesFor(d);
    const sel = shell.gestures.selection;
    const ids = (k: string) => new Set(sel.filter(s => s.kind === k).map(s => s.id));
    const m = shell.module, extra = m?.renderExtras?.(d) ?? {};
    const tree = h('g', {}, [
      framesLayer(d.frames, { selected: ids('frame'), measure: shell.measure }),
      ...(extra.below ?? []),
      wiresLayer(d, routes, { selected: new Set([...ids('wire'), ...ids('junction')]) }),
      blocksLayer(d, { selected: ids('block'), theme: d.theme, decorate: m?.decorate, footer: m?.blockFooter && ((b, x) => m.blockFooter!(b, x, shell.measure)) }),
      textsLayer(d.texts, { selected: ids('text'), measure: shell.measure }),
      ...(extra.above ?? []),
      overlay(shell),
    ]);
    const c = shell.camera;
    layer.setAttribute('transform', `translate(${r2(c.x)},${r2(c.y)}) scale(${c.z})`);
    layer.replaceChildren(...mount(tree).childNodes);
    const svg = svgRef.current;
    if (!svg) return;
    const bg = backgroundOf(c, gridSize(d.grid));
    svg.style.setProperty('--grid-size', `${bg.size}px`);
    svg.style.setProperty('--grid-x', `${bg.x}px`);
    svg.style.setProperty('--grid-y', `${bg.y}px`);
    svg.dataset.grid = String(d.grid.show);
    svg.dataset.invalid = String(invalidCount(routes));
  }, [shell, version]);

  if (shell.module?.canvas) return <DrawingCanvas shell={shell} />;
  if (!shell.isBlockDiagram) return <div className="af-canvas af-canvas-empty">{t('canvas.unsupported')}</div>;

  return (
    <svg
      ref={svgRef}
      className="af-canvas"
      role="application"
      aria-label={t('canvas.label')}
      tabIndex={0}
      onPointerDown={e => { const svg = svgRef.current!; svg.setPointerCapture(e.pointerId); svg.focus(); shell.gestures.down(pointer(svg, e)); }}
      onPointerMove={e => shell.gestures.move(pointer(svgRef.current!, e))}
      onPointerUp={e => { const svg = svgRef.current!; shell.gestures.up(pointer(svg, e)); if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => shell.gestures.cancel()}
      onContextMenu={e => e.preventDefault()}
    >
      <g ref={layerRef} className="af-world" />
    </svg>
  );
}

/**
 * The canvas of a design that draws itself (DesignModule.canvas: schedule). Drag pans, the wheel
 * zooms; editing on the drawing arrives with the design's editing step (3.29).
 */
function DrawingCanvas({ shell }: { shell: Shell }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const pan = useRef<{ x: number; y: number; cam: { x: number; y: number; z: number } } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const version = useVersion(shell.store) + useVersion(shell.ui) * 1e-6;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const size = () => {
      shell.setViewport({ w: svg.clientWidth, h: svg.clientHeight });
      if (shell.pendingFit && svg.clientWidth > 0) { shell.pendingFit = false; shell.fitView(); }
    };
    const ro = new ResizeObserver(size);
    ro.observe(svg);
    size();
    const wheel = (e: WheelEvent) => { e.preventDefault(); const p = pointer(svg, { ...e, button: 0 }); shell.gestures.wheel(e.deltaY, p); };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); svg.removeEventListener('wheel', wheel); };
  }, [shell]);

  useLayoutEffect(() => {
    const layer = layerRef.current, m = shell.module;
    if (!layer || !m?.canvas) return;
    const out = m.canvas.render(shell.store.data(shell.store.activeDesignId), { selected: new Set(), measure: shell.measure });
    const c = shell.camera;
    layer.setAttribute('transform', `translate(${r2(c.x)},${r2(c.y)}) scale(${c.z})`);
    layer.replaceChildren(...(out.node ? mount(h('g', {}, [out.node])).childNodes : []));
    setError(out.error ?? null);
    svgRef.current!.dataset.grid = 'false';
  }, [shell, version]);

  return (
    <>
      <svg
        ref={svgRef}
        className="af-canvas"
        role="img"
        aria-label={shell.store.activeDesign?.name ?? t('canvas.label')}
        tabIndex={0}
        onPointerDown={e => { const svg = svgRef.current!; svg.setPointerCapture(e.pointerId); svg.focus(); pan.current = { x: e.clientX, y: e.clientY, cam: { ...shell.camera } }; }}
        onPointerMove={e => { const p = pan.current; if (p) shell.store.setCamera({ ...p.cam, x: p.cam.x + e.clientX - p.x, y: p.cam.y + e.clientY - p.y }); }}
        onPointerUp={e => { pan.current = null; const svg = svgRef.current!; if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { pan.current = null; }}
        onContextMenu={e => e.preventDefault()}
      >
        <g ref={layerRef} className="af-world" />
      </svg>
      {error && <p className="af-canvas-error" role="alert">{t(error)}</p>}
    </>
  );
}
