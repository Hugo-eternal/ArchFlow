// Diagram theme: the fonts and sizes of a block diagram (V2 "Layout and fonts" dialog:
// defaultTheme / cleanTheme / fontStack). Sizes are stored in px, the dialog shows pt.
import type { Theme } from '../io/schema-types';

export const LATIN_FONTS = ['Noto Sans', 'Arial', 'Aptos', 'Segoe UI', 'Calibri'] as const;
export const CJK_FONTS = ['Microsoft JhengHei', 'Noto Sans TC', 'PingFang TC'] as const;

/** V2 defaultTheme (px). */
export const DEFAULT_THEME: Readonly<Theme> = Object.freeze({ latinFont: 'Noto Sans', cjkFont: 'Microsoft JhengHei', title: 80 / 3, subtitle: 14, label: 11, metric: 14 });

/** px limits of each size (V2 cleanTheme). */
export const THEME_LIMITS = { title: [12, 48], subtitle: [9, 32], label: [8, 28], metric: [9, 32] } as const;
export type ThemeSize = keyof typeof THEME_LIMITS;

/** A theme with known fonts and sizes inside the limits (V2 cleanTheme). */
export function cleanTheme(raw: Partial<Theme> | null | undefined): Theme {
  const t = raw ?? {};
  const size = (k: ThemeSize) => { const v = Number(t[k]); const [lo, hi] = THEME_LIMITS[k]; return Number.isFinite(v) && t[k] !== undefined ? Math.max(lo, Math.min(hi, v)) : DEFAULT_THEME[k]; };
  return {
    latinFont: (LATIN_FONTS as readonly string[]).includes(t.latinFont ?? '') ? t.latinFont! : DEFAULT_THEME.latinFont,
    cjkFont: (CJK_FONTS as readonly string[]).includes(t.cjkFont ?? '') ? t.cjkFont! : DEFAULT_THEME.cjkFont,
    title: size('title'), subtitle: size('subtitle'), label: size('label'), metric: size('metric'),
  };
}

/** CSS font-family of a theme (V2 fontStack); the embedded UI font is the last resort. */
export const fontStack = (t: Pick<Theme, 'latinFont' | 'cjkFont'>) => `"${t.latinFont}", "${t.cjkFont}", "Noto Sans CJK TC", var(--font-ui), sans-serif`;

export const pxToPt = (px: number) => Math.round(px * 0.75 * 100) / 100;
export const ptToPx = (pt: number) => pt * 4 / 3;
