// Per-browser preferences (not part of a project file): localStorage with the archflow: prefix,
// every access guarded (private windows, blocked storage).

const KEY_SCALE_TEXT = 'archflow:scaleText';

/** V2.10 "Scale text with the block" (V2 localStorage af-scale-text-v1, default on). */
export function scaleTextOn(): boolean {
  try { return globalThis.localStorage?.getItem(KEY_SCALE_TEXT) !== '0'; } catch { return true; }
}

export function setScaleText(on: boolean): void {
  try { globalThis.localStorage?.setItem(KEY_SCALE_TEXT, on ? '1' : '0'); } catch { /* storage blocked: keep the default */ }
}
