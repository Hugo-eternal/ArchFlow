// designs/schedule — appearance: four colour themes, font sizes and one custom look (colours,
// corner radius, border width, line width). The theme colours live in the design tokens
// (--sched-<theme>-*, switched by data-sched-theme); a custom look is written as CSS custom
// properties on the drawing, like a block's own colours.
//
// V2 (legacy/app.zh-Hant.html): scheduleThemes L780–L783, engineeringPalette / engineeringNodePalette
// L785–L786, custom look and theme cards L787–L792, the custom slot L816–L818 (three presets
// plus one kept custom slot; a preset never erases the slot), branch colours L795–L796, line
// width L849–L850.
import type { ScheduleAppearance, ScheduleCustomLook, ScheduleData, ScheduleTheme } from '../../io/schema-types';

export const THEMES: readonly ScheduleTheme[] = ['blue', 'mint', 'slate', 'amber'];

/**
 * The theme colours as V2 defined them — only for colour pickers ("current colour" while no
 * custom value is set) and the token test; the drawing uses the --sched-* tokens.
 */
export const THEME_SWATCH: Record<ScheduleTheme, Required<Pick<ScheduleCustomLook, 'card' | 'border' | 'ink' | 'line' | 'radius'>>> = {
  blue: { card: '#f8fafc', border: '#64748b', ink: '#172b46', line: '#52677e', radius: 4 },
  mint: { card: '#f6faf9', border: '#66847f', ink: '#203d38', line: '#53766d', radius: 4 },
  slate: { card: '#ffffff', border: '#68727f', ink: '#25303d', line: '#5e6c7b', radius: 2 },
  amber: { card: '#fcfaf7', border: '#97836b', ink: '#463b2d', line: '#88745d', radius: 3 },
};
export const DEFAULT_WIDTH = 1.5;
export const DEFAULT_LINE_WIDTH = 2;

export const themeOf = (a: ScheduleAppearance): ScheduleTheme => (a.theme && THEMES.includes(a.theme) ? a.theme : 'blue');

/** The custom look in use (V2: engineeringStyle is applied whenever it is set). */
export const customOf = (a: ScheduleAppearance): ScheduleCustomLook => a.engineering ?? {};

/** Corner radius, border and line widths after the custom look. */
export function geometry(a: ScheduleAppearance): { radius: number; width: number; lineWidth: number } {
  const c = customOf(a);
  return { radius: c.radius ?? THEME_SWATCH[themeOf(a)].radius, width: c.width ?? DEFAULT_WIDTH, lineWidth: c.lineWidth ?? DEFAULT_LINE_WIDTH };
}

/** Inline custom properties for the drawing root: custom colours and widths. */
export function lookStyle(a: ScheduleAppearance): string | undefined {
  const c = customOf(a), g = geometry(a), parts: string[] = [];
  if (c.card) parts.push(`--sched-card:${c.card}`);
  if (c.border) parts.push(`--sched-border:${c.border}`, `--sched-muted:${c.border}`);
  if (c.ink) parts.push(`--sched-ink:${c.ink}`);
  if (c.line) parts.push(`--sched-line:${c.line}`);
  if (g.width !== DEFAULT_WIDTH) parts.push(`--sched-card-width:${g.width}px`);
  if (g.lineWidth !== DEFAULT_LINE_WIDTH) parts.push(`--sched-link-width:${g.lineWidth}px`, `--sched-thin-width:${Math.max(1, g.lineWidth * 0.75)}px`);
  return parts.length ? parts.join(';') : undefined;
}

// ---------------------------------------------------------------- edits (pure)

const withAppearance = (d: ScheduleData, a: ScheduleAppearance): ScheduleData => ({ ...d, appearance: a });

/** Choose a preset theme: the custom look is switched off, the kept custom slot stays (V2 L790 / L816). */
export function setTheme(d: ScheduleData, theme: ScheduleTheme): ScheduleData {
  const { engineering: _e, customActive: _c, ...rest } = d.appearance;
  return withAppearance(d, { ...rest, theme });
}

/** Switch to the custom slot: the kept custom look (or the current theme's colours) becomes active. */
export function useCustom(d: ScheduleData): ScheduleData {
  const a = d.appearance, base = THEME_SWATCH[themeOf(a)];
  const look = a.savedCustom ?? { card: base.card, border: base.border, ink: base.ink, line: base.line, radius: base.radius, width: DEFAULT_WIDTH };
  return withAppearance(d, { ...a, engineering: { ...look }, savedCustom: { ...look }, customActive: true });
}

/** Change part of the custom look (kept in the custom slot too). */
export function setCustom(d: ScheduleData, patch: ScheduleCustomLook): ScheduleData {
  const a = d.appearance, look = { ...(a.engineering ?? {}), ...patch };
  for (const k of Object.keys(look) as (keyof ScheduleCustomLook)[]) if (look[k] === undefined) delete look[k];
  return withAppearance(d, { ...a, engineering: look, savedCustom: { ...look }, customActive: true });
}

export function setSizes(d: ScheduleData, patch: Partial<Pick<ScheduleAppearance, 'title' | 'body' | 'time'>>): ScheduleData {
  return withAppearance(d, { ...d.appearance, ...patch });
}

/** Branch colour on a task and everything after it, links included (V2 setBranchColor L796). */
export function setBranchColor(d: ScheduleData, id: string, color: string | null, after: ReadonlySet<string>): ScheduleData {
  const ids = new Set([id, ...after]);
  const tag = <T extends { branchColor?: string }>(x: T): T => {
    const { branchColor: _b, ...rest } = x;
    return (color ? { ...rest, branchColor: color } : rest) as T;
  };
  return {
    ...d,
    tasks: d.tasks.map(t => (ids.has(t.id) ? tag(t) : t)),
    links: d.links.map(l => (ids.has(l.to) ? tag(l) : l)),   // the link into the task too, as V2
  };
}
