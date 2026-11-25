// Camera: pan, zoom around a point, fit to content. Pure functions on { x, y, z } — screen
// = world * z + (x, y) — so they can be tested without a DOM. Coordinates passed in as
// "screen" are relative to the canvas' top-left corner (V2 subtracted getBoundingClientRect()).
//
// V2: applyCamera L290, point L261, zoomAt L322, wheel L323, ± buttons L324, fit L336,
// focusPoint L348. The per-type fit variants of V2 (schedule L601 / L632 / L669, frames L4445)
// become FitOptions chosen by each design module.
import type { Camera, Point } from '../io/schema-types';

export interface Viewport { w: number; h: number }
export interface Bounds { x: number; y: number; w: number; h: number }

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.5;
/** Zoom factor of one ± button press (V2 L324). */
export const ZOOM_STEP = 1.2;

export const IDENTITY: Readonly<Camera> = Object.freeze({ x: 0, y: 0, z: 1 });

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const clampZoom = (z: number, min = ZOOM_MIN, max = ZOOM_MAX) => clamp(z, min, max);

export const toWorld = (c: Camera, p: Point): Point => ({ x: (p.x - c.x) / c.z, y: (p.y - c.y) / c.z });
export const toScreen = (c: Camera, p: Point): Point => ({ x: p.x * c.z + c.x, y: p.y * c.z + c.y });

/** CSS transform of the world layer. */
export const transformOf = (c: Camera) => `translate(${c.x}px,${c.y}px) scale(${c.z})`;

export const panBy = (c: Camera, dx: number, dy: number): Camera => ({ x: c.x + dx, y: c.y + dy, z: c.z });

/** Zoom to `z` (clamped) keeping the world point under screen point `at` fixed. */
export function zoomAt(c: Camera, z: number, at: Point): Camera {
  const p = toWorld(c, at), nz = clampZoom(z);
  return { x: at.x - p.x * nz, y: at.y - p.y * nz, z: nz };
}

/** Mouse-wheel zoom factor (V2 L323). */
export const wheelFactor = (deltaY: number) => Math.exp(-deltaY * 0.001);

/** Zoom by `factor` around the centre of the viewport (V2 ± buttons). */
export const zoomBy = (c: Camera, factor: number, v: Viewport): Camera => zoomAt(c, c.z * factor, { x: v.w / 2, y: v.h / 2 });

/** Keep the zoom, move so that world point `p` is in the centre (V2 focusPoint L348). */
export const centreOn = (c: Camera, p: Point, v: Viewport): Camera => ({ x: v.w / 2 - p.x * c.z, y: v.h / 2 - p.y * c.z, z: c.z });

export interface FitOptions {
  /** Total horizontal / vertical margin in screen px (V2 function / power: 110 / 130). */
  marginX?: number; marginY?: number;
  minZ?: number; maxZ?: number;
}
/** V2 L336 — function and power designs. */
export const FIT_DEFAULT: Required<FitOptions> = { marginX: 110, marginY: 130, minZ: 0.2, maxZ: 1.1 };

/** Camera showing `b` centred in the viewport. Returns null for empty / invalid bounds. */
export function fit(b: Bounds | null, v: Viewport, opts: FitOptions = {}): Camera | null {
  if (!b || !(b.w >= 0) || !(b.h >= 0) || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return null;
  const o = { ...FIT_DEFAULT, ...opts };
  // a zero-size side gives Infinity and is limited by the other side / maxZ, as in V2
  const z = clamp(Math.min(o.maxZ, (v.w - o.marginX) / b.w, (v.h - o.marginY) / b.h), o.minZ, Infinity);
  return { x: (v.w - b.w * z) / 2 - b.x * z, y: (v.h - b.h * z) / 2 - b.y * z, z };
}

/** Smallest box containing all rectangles and points; null when there are none. */
export function unionBounds(rects: readonly Bounds[] = [], points: readonly Point[] = []): Bounds | null {
  let l = Infinity, t = Infinity, r = -Infinity, btm = -Infinity;
  for (const b of rects) { l = Math.min(l, b.x); t = Math.min(t, b.y); r = Math.max(r, b.x + b.w); btm = Math.max(btm, b.y + b.h); }
  for (const p of points) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); btm = Math.max(btm, p.y); }
  return l === Infinity ? null : { x: l, y: t, w: r - l, h: btm - t };
}

/** Canvas background grid that moves with the camera (V2 applyCamera L290). */
export function backgroundOf(c: Camera, gridSize = 10): { size: number; x: number; y: number } {
  return { size: gridSize * c.z, x: c.x, y: c.y };
}
