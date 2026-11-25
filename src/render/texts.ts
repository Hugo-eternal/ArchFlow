// Free text boxes as SVG (V2 renderFreeTexts L499 drew HTML divs that wrapped by themselves;
// SVG text does not wrap, so lines are broken here with an injectable width measure — the
// canvas uses a real one, Node tests the estimate).
import type { TextBox } from '../io/schema-types';
import { h, r2, type VNode } from './vnode';

// CJK ranges (written as escapes: src/ holds no CJK text, scripts/check-i18n.mjs)
const CJK = '\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF';
const CJK_CHAR = new RegExp(`[${CJK}]`);
const TOKEN = new RegExp(`[${CJK}]|\\s+|[^\\s${CJK}]+`, 'g');

/** Width of `text` at `fontPx` (bold / italic). */
export type Measure = (text: string, fontPx: number, bold: boolean, italic: boolean) => number;

/** Rough width without a browser: CJK full width, Latin ≈ 0.55 em. */
export const estimateWidth: Measure = (text, px, bold) =>
  [...text].reduce((n, ch) => n + (CJK_CHAR.test(ch) ? 1 : /\s/.test(ch) ? 0.3 : 0.55), 0) * px * (bold ? 1.05 : 1);

/** A canvas-based measure for the browser (fonts as on the canvas). */
export function canvasMeasure(fontFamily: string): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return estimateWidth;
  return (text, px, bold, italic) => { ctx.font = `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${px}px ${fontFamily}`; return ctx.measureText(text).width; };
}

/** Text size is stored in points (V2: font-size …pt); SVG uses px. */
export const ptToPx = (pt: number) => (pt * 4) / 3;
export const TEXT_PAD = 4;
export const LINE_HEIGHT = 1.35;

/**
 * Break text into lines no wider than `width`: explicit newlines first, then at spaces, and
 * between any two CJK characters; a single over-long word is split by character.
 */
export function wrapText(text: string, width: number, px: number, bold = false, italic = false, measure: Measure = estimateWidth): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    // tokens: runs of non-space Latin, single CJK characters, spaces
    const tokens = para.match(TOKEN) ?? [''];
    let line = '';
    const fits = (s: string) => measure(s, px, bold, italic) <= width;
    for (const tok of tokens) {
      if (fits(line + tok)) { line += tok; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = /^\s+$/.test(tok) ? '' : tok;
      while (line && !fits(line)) {
        // split an over-long token by character
        let i = 1;
        while (i < line.length && fits(line.slice(0, i + 1))) i++;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export interface TextRenderOptions { selected?: ReadonlySet<string>; measure?: Measure }

export function textNode(t: TextBox, opts: TextRenderOptions = {}): VNode {
  const px = ptToPx(t.size), inner = Math.max(1, t.w - 2 * TEXT_PAD);
  const lines = wrapText(t.text, inner, px, t.bold, t.italic, opts.measure);
  const lh = px * LINE_HEIGHT, height = lines.length * lh + 2 * TEXT_PAD;
  const x = t.align === 'center' ? t.x + t.w / 2 : t.align === 'right' ? t.x + t.w - TEXT_PAD : t.x + TEXT_PAD;
  const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
  const selected = opts.selected?.has(t.id);
  return h('g', { class: `af-text${selected ? ' is-selected' : ''}`, 'data-text': t.id }, [
    t.background && t.background !== 'transparent'
      ? h('rect', { class: 'af-text-bg', x: r2(t.x), y: r2(t.y), width: r2(t.w), height: r2(height), rx: 4, style: `fill:${t.background}` }) : null,
    h('text', {
      class: 'af-text-body', x: r2(x), y: r2(t.y + TEXT_PAD), 'text-anchor': anchor,
      style: `font-size:${r2(px)}px;fill:${t.color};font-weight:${t.bold ? 700 : 400};font-style:${t.italic ? 'italic' : 'normal'}`,
    }, lines.map((ln, i) => h('tspan', { x: r2(x), dy: i === 0 ? r2(px) : r2(lh) }, ln || ' '))),
    selected ? h('rect', { class: 'af-text-selection', x: r2(t.x - 3), y: r2(t.y - 3), width: r2(t.w + 6), height: r2(height + 6), rx: 5 }) : null,
  ]);
}

export function textsLayer(texts: readonly TextBox[], opts: TextRenderOptions = {}): VNode {
  return h('g', { class: 'af-texts' }, texts.map(t => textNode(t, opts)));
}
