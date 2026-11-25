// Readability estimate of an export (V2 readabilityReport L442): how large block titles and
// port / wire labels appear when the page is shown whole on a 1366 × 768 screen; warn when a
// title is under 16 px or a label under 10 px. V3 adds two checks V2 only showed on the canvas:
// wires without a valid route, and text boxes overlapping blocks or each other.
import type { BlockDiagram } from '../io/schema-types';
import type { MessageKey, Vars } from '../core/i18n';
import { textLayout, estimateWidth, ptToPx, TEXT_PAD, type Measure } from '../render/texts';
import type { Route } from '../router/full-path';
import { parseTokens } from './inline-style';
import tokensCss from '../styles/tokens.css?raw';

export const SCREEN = Object.freeze({ width: 1366, height: 768 });
export const MIN_TITLE_PX = 16;
export const MIN_LABEL_PX = 10;

export interface ReadabilityNote { key: MessageKey; vars?: Vars }
export interface Readability { warning: boolean; title: number; label: number; notes: ReadabilityNote[] }

const tokenPx = (name: string, fallback: number) => parseFloat(parseTokens(tokensCss).get(name) ?? '') || fallback;

interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function readability(
  d: BlockDiagram,
  page: { width: number; height: number; scale: number },
  routes: ReadonlyMap<string, Route>,
  measure: Measure = estimateWidth,
): Readability {
  const notes: ReadabilityNote[] = [];
  if (!d.blocks.length) {
    notes.push({ key: d.texts.length ? 'export.read.textOnly' : 'export.read.empty' });
    return { warning: false, title: 0, label: 0, notes };
  }
  const screen = Math.min(1, SCREEN.width / page.width, SCREEN.height / page.height);
  const effective = page.scale * screen;
  const themeTitle = d.theme?.title ?? tokenPx('--block-title-size', 20);
  const themeLabel = d.theme?.label ?? tokenPx('--port-label-size', 11);
  const title = Math.min(...d.blocks.map(b => b.style.titleSize ?? themeTitle)) * effective;
  const label = themeLabel * effective;
  const small = title < MIN_TITLE_PX || label < MIN_LABEL_PX;
  const one = (v: number) => v.toFixed(1);
  notes.push({ key: 'export.read.size', vars: { width: page.width, height: page.height, title: one(title), label: one(label) } });
  notes.push({ key: small ? 'export.read.small' : 'export.read.ok' });
  const invalid = [...routes.values()].filter(r => !r.valid).length;
  if (invalid) notes.push({ key: 'export.read.invalid', vars: { count: invalid } });
  // the inked area of a text box: inside the padding, from the first cap line to the last baseline
  const texts = d.texts.map(t => {
    const { lines, lineHeight } = textLayout(t, measure), px = ptToPx(t.size);
    return { x: t.x + TEXT_PAD, y: t.y + TEXT_PAD, w: Math.max(0, t.w - 2 * TEXT_PAD), h: (lines.length - 1) * lineHeight + px };
  });
  let overlaps = 0;
  texts.forEach((t, i) => {
    if (d.blocks.some(b => overlap(t, b)) || texts.some((u, j) => j !== i && overlap(t, u))) overlaps++;
  });
  if (overlaps) notes.push({ key: 'export.read.overlap', vars: { count: overlaps } });
  notes.push({ key: 'export.read.estimate' });
  return { warning: small || invalid > 0 || overlaps > 0, title, label, notes };
}
