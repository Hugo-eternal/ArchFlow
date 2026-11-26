// The block-diagram canvas: one <svg>. The drawing is render/* VNodes mounted on every change
// (the draft while dragging); pointer input goes to interaction/gestures, the wheel zooms.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import type { CanvasSelection } from '../designs/module';
import type { Design } from '../io/schema-types';
import { useVersion } from './use-store';
import { useLocale } from './AppBar';

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
      wiresLayer(d, routes, { selected: new Set([...ids('wire'), ...ids('junction')]), tone: m?.wireTone && (w => m.wireTone!(w, d)) }),
      blocksLayer(d, { selected: ids('block'), resizable: resizable(d, sel), theme: d.theme, decorate: m?.decorate, footer: m?.blockFooter && ((b, x) => m.blockFooter!(b, x, shell.measure)), faded: m?.blockFaded && ((b, x) => m.blockFaded!(b, x)) }),
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

  if (shell.module?.embedded) return <EmbeddedFrame shell={shell} />;
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
 * A design edited by a vendor editor: its iframe (V2 mounted the same srcdoc). The editor reads
 * the host object from this window (shell/embedded.ts) and loads the active design's document.
 */
function EmbeddedFrame({ shell }: { shell: Shell }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const m = shell.module!.embedded!;
  // the vendor editor takes its language when it loads: a language switch reloads it (the
  // document is in the store already; the editor's own undo history starts over)
  const lang = useLocale() === 'en' ? 'en' : 'zh-Hant';
  const srcdoc = useMemo(() => m.srcdoc(lang), [m, lang]);
  useEffect(() => {
    shell.setFrame(ref.current);
    return () => shell.setFrame(null);
  }, [shell, lang]);
  return <iframe key={lang} ref={ref} className="af-embedded-frame" title={t(m.title)} srcDoc={srcdoc} allow="clipboard-read; clipboard-write" />;
}

/** The one selected block that can be resized (not locked, not a part or connector). */
function resizable(d: Design['data'] & { blocks: { id: string; locked: boolean; part?: unknown; connector?: unknown }[] }, sel: readonly { kind: string; id: string }[]): string | undefined {
  if (sel.length !== 1 || sel[0].kind !== 'block') return undefined;
  const b = d.blocks.find(x => x.id === sel[0].id);
  return b && !b.locked && !b.part && !b.connector ? b.id : undefined;
}

/** data-* attributes of an element and its ancestors up to the drawing (nearest wins). */
function attrsOf(el: Element | null, stop: Element): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let e = el; e && e !== stop; e = e.parentElement) for (const [k, v] of Object.entries((e as HTMLElement | SVGElement).dataset ?? {})) if (!(k in out)) out[k] = v;
  return out;
}

type Drag =
  | { kind: 'pan'; x: number; y: number; cam: { x: number; y: number; z: number } }
  | { kind: 'item'; x: number; y: number; start: Design['data']; sel: CanvasSelection; handle?: string; moved: boolean; draft: Design['data']; guides?: { x: number | null; y: number | null } };

/**
 * The canvas of a design that draws itself (DesignModule.canvas: schedule). Empty space: drag
 * pans; an item: click selects, drag moves it (drawn as a draft, one undo step on release,
 * Escape cancels); arrow keys nudge the selection, Delete removes it; the wheel zooms.
 */
function DrawingCanvas({ shell }: { shell: Shell }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [, redraw] = useState(0);
  const [error, setError] = useState<MessageKey | null>(null);
  // re-render (and so redraw: the layout effect below has no deps) on any store / shell change
  useVersion(shell.store);
  useVersion(shell.ui);
  const drawing = shell.module?.canvas;

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
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current?.kind === 'item') { e.preventDefault(); e.stopPropagation(); drag.current = null; redraw(n => n + 1); } };
    window.addEventListener('keydown', esc, true);
    return () => { ro.disconnect(); svg.removeEventListener('wheel', wheel); window.removeEventListener('keydown', esc, true); };
  }, [shell]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !drawing) return;
    const g = drag.current, item = shell.item;
    const data = g?.kind === 'item' && g.moved ? g.draft : shell.store.data(shell.store.activeDesignId);
    const out = drawing.render(data, { selected: new Set(item ? [item.id] : []), measure: shell.measure, guides: g?.kind === 'item' ? g.guides : undefined });
    const c = shell.camera;
    layer.setAttribute('transform', `translate(${r2(c.x)},${r2(c.y)}) scale(${c.z})`);
    layer.replaceChildren(...(out.node ? mount(h('g', {}, [out.node])).childNodes : []));
    setError(out.error ?? null);
    svgRef.current!.dataset.grid = 'false';
  });

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    if (e.button !== 0 && e.button !== 1) return;
    svg.setPointerCapture(e.pointerId);
    svg.focus();
    const hit = e.button === 0 ? drawing?.target?.(attrsOf(e.target as Element, svg)) : null;
    if (hit) {
      shell.selectItem(hit.sel);
      const start = shell.store.data(shell.store.activeDesignId);
      drag.current = { kind: 'item', x: e.clientX, y: e.clientY, start, sel: hit.sel, handle: hit.handle, moved: false, draft: start };
    } else {
      if (e.button === 0 && shell.item) shell.selectItem(null);
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, cam: { ...shell.camera } };
    }
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = drag.current;
    if (!g) return;
    if (g.kind === 'pan') { shell.store.setCamera({ ...g.cam, x: g.cam.x + e.clientX - g.x, y: g.cam.y + e.clientY - g.y }); return; }
    if (!g.handle || !drawing?.drag) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return;
    const z = shell.camera.z;
    const r = drawing.drag(g.start, g.sel, g.handle, (e.clientX - g.x) / z, (e.clientY - g.y) / z, { shift: e.shiftKey, alt: e.altKey, zoom: z });
    g.moved = true; g.draft = r.data; g.guides = r.guides;
    redraw(n => n + 1);
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = drag.current;
    drag.current = null;
    const svg = svgRef.current!;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (g?.kind === 'item' && g.moved) shell.editDesign(() => g.draft);
    redraw(n => n + 1);
  };
  const key = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const sel = shell.item;
    if (!sel || !drawing || e.ctrlKey || e.metaKey || e.altKey) return;
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key], k = e.shiftKey ? 10 : 1;
    if (step && drawing.nudge) { e.preventDefault(); e.stopPropagation(); shell.editDesign(d => drawing.nudge!(d, sel, step[0] * k, step[1] * k)); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && drawing.remove) { e.preventDefault(); e.stopPropagation(); if (shell.editDesign(d => drawing.remove!(d, sel))) shell.selectItem(null); }
    else if (e.key === 'Escape' && !drag.current) { e.stopPropagation(); shell.selectItem(null); }
  };

  return (
    <>
      <svg
        ref={svgRef}
        className="af-canvas"
        role="application"
        aria-label={drawing?.label ? t(drawing.label) : t('canvas.label')}
        aria-roledescription={shell.store.activeDesign?.name}
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { drag.current = null; redraw(n => n + 1); }}
        onKeyDown={key}
        onContextMenu={e => e.preventDefault()}
      >
        <g ref={layerRef} className="af-world" />
      </svg>
      {error && <p className="af-canvas-error" role="alert">{t(error)}</p>}
    </>
  );
}
