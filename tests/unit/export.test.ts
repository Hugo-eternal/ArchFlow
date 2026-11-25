// module: export — V3 src/export/* (canvas styles inlined as presentation attributes, SVG /
// page / PNG export, readability), compared with the V2.10.1 golden exports of the function and
// power examples for what is ported so far (wires, block bodies, wire labels, markers, bounds).
// Part symbols, frames, connectors and power metric tables arrive with designs/* (3.25–3.27).
// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { exportSvg, exportFileName, contentBounds, styleDrawing, ExportError, EXPORT_MARGIN } from '../../src/export/svg';
import { parseRules, parseTokens, resolveVars, inlineStyles } from '../../src/export/inline-style';
import { fitPage, PAGE_SIZES } from '../../src/export/page';
import { readability } from '../../src/export/readability';
import { routeAll } from '../../src/router/full-path';
import { h } from '../../src/render/vnode';
import { setLocale, t, type MessageKey } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import type { BlockDiagram } from '../../src/io/schema-types';
import tokensCss from '../../src/styles/tokens.css?raw';
import canvasCss from '../../src/styles/canvas.css?raw';

const ROOT = path.resolve(__dirname, '../..');
const golden = (type: 'function' | 'power'): BlockDiagram => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/${type}/__snapshots__/project.v3.json`), 'utf8'));
  return p.designs.find((d: { type: string }) => d.type === type).data;
};
const v2Export = (type: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/${type}/__snapshots__/export.svg.json`), 'utf8')).elements as Record<string, string>[];

type El = Record<string, string> & { tag: string };
function structure(src: string): El[] {
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  const out: El[] = [];
  const walk = (el: Element) => {
    const o: El = { tag: el.tagName };
    for (const a of el.attributes) o[a.name] = a.value;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue!.trim()).join('');
    if (own) o.text = own;
    out.push(o);
    for (const c of el.children) walk(c);
  };
  walk(doc.documentElement);
  return out;
}
/** "M1,2 L1,2 L3,2" → "1,2 3,2" (consecutive duplicate points removed: V2 repeats both ends). */
const polyline = (d: string) => {
  const pts = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(x => Math.round(Number(x[0]) * 2) / 2);
  const out: string[] = [];
  for (let i = 0; i < pts.length; i += 2) { const p = `${pts[i]},${pts[i + 1]}`; if (out[out.length - 1] !== p) out.push(p); }
  return out.join(' ');
};
const wirePaths = (els: Record<string, string>[]) => els.filter(e => e.tag === 'path' && /^M-?\d[\d.]*,-?[\d.]+ L/.test(e.d ?? '')).map(e => polyline(e.d)).sort();

describe('canvas styles → presentation attributes', () => {
  it('every canvas.css selector is supported and every var() resolves in both themes', () => {
    const rules = parseRules(canvasCss);
    expect(rules.length).toBeGreaterThan(20);
    for (const theme of ['light', 'dark'] as const) {
      const vars = parseTokens(tokensCss, theme);
      for (const r of rules) for (const [, v] of r.decls) expect(() => resolveVars(v, vars)).not.toThrow();
    }
    expect(parseTokens(tokensCss, 'light').get('--color-surface')).not.toBe(parseTokens(tokensCss, 'dark').get('--color-surface'));
  });

  it('applies the cascade: specificity, source order, inline style, inherited custom properties', () => {
    const rules = parseRules('.a { fill: var(--c); stroke-width: 2px } .a.b { fill: red } g .a { stroke: blue } .x [data-on="1"] { opacity: 0.5 }');
    const tree = h('g', { class: 'x', style: '--c:green' }, [
      h('rect', { class: 'a' }), h('rect', { class: 'a b' }), h('rect', { class: 'a', style: 'fill:pink' }), h('circle', { 'data-on': 1 }),
    ]);
    const out = inlineStyles(tree, { rules, vars: new Map() });
    expect(out.children.map(c => c.attrs)).toEqual([
      { fill: 'green', 'stroke-width': '2', stroke: 'blue' },
      { fill: 'red', 'stroke-width': '2', stroke: 'blue' },
      { fill: 'pink', 'stroke-width': '2', stroke: 'blue' },
      { opacity: '0.5' },
    ]);
    expect(() => parseRules('@media print { .a { fill: red } }')).toThrow();
    expect(() => parseRules('.a > .b { fill: red }')).toThrow();
    expect(resolveVars('var(--nope, var(--y))', new Map([['--y', '3px']]))).toBe('3px');
  });

  it('block colours from the model win over the theme', () => {
    let d = m.emptyDiagram();
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A', style: { fill: '#123456' } }).data;
    const src = exportSvg(d).source;
    expect(src).toContain('fill="#123456"');
  });
});

describe('SVG export of the golden examples', () => {
  for (const type of ['function', 'power'] as const) {
    it(`${type}: wires, block bodies, wire labels, markers and bounds match V2`, () => {
      const d = golden(type), e = exportSvg(d), v3 = structure(e.source), v2 = v2Export(type);
      // standalone: no classes, no editor data, no CSS variables, no <style>
      expect(e.source).not.toMatch(/ class=| data-|var\(|<style/);
      // wires (same routes as V2, step 3.16)
      expect(wirePaths(v3)).toEqual(wirePaths(v2));
      // bounds: V2 measured the rendered glyphs of text boxes, V3 uses the box (≤ 6 px)
      const vb2 = v2[0].viewBox.split(' ').map(Number);
      e.viewBox.forEach((v, i) => expect(Math.abs(v - vb2[i]), `viewBox[${i}]`).toBeLessThanOrEqual(6));
      // every non-part block body is where V2 drew it
      const rects = (els: Record<string, string>[]) => els.filter(x => x.tag === 'rect').map(x => [x.x, x.y, x.width, x.height].map(Number));
      const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 1);
      for (const b of d.blocks.filter(b => !b.part && !b.connector)) {
        const box = [b.x, b.y, b.w, b.h];
        expect(rects(v3).some(r => near(r, box)), `V3 block ${b.id}`).toBe(true);
        expect(rects(v2).some(r => near(r, box)), `V2 block ${b.id}`).toBe(true);
      }
      // wire labels are V2 texts
      const v2Texts = new Set(v2.filter(x => x.text).map(x => x.text));
      for (const w of v3.filter(x => x.tag === 'text' && x['paint-order'])) expect(v2Texts.has(w.text), w.text).toBe(true);
      // arrow colours are V2 marker colours; V2 exports have no port dots
      const fills = (els: Record<string, string>[], i: number) => new Set(els.filter((x, j) => x.tag === 'path' && els[j - 1]?.tag === 'marker').map(x => x.fill?.toLowerCase()).filter(Boolean).slice(0, i));
      for (const f of fills(v3, 99)) expect(fills(v2, 99).has(f), f).toBe(true);
      expect(v3.some(x => x.tag === 'circle' && x.r === '3.5')).toBe(false);
      // white background like V2, transparent on request
      expect(v3.find(x => x.tag === 'rect')).toMatchObject({ x: String(e.viewBox[0]), y: String(e.viewBox[1]), fill: '#FFFFFF' });
      expect(structure(exportSvg(d, { transparent: true }).source).filter(x => x.tag === 'rect' && x.x === String(e.viewBox[0]))).toHaveLength(0);
    });
  }

  it('the dark theme resolves to other colours', () => {
    const d = golden('function');
    const light = exportSvg(d).source, dark = exportSvg(d, { theme: 'dark' }).source;
    expect(dark).not.toBe(light);
    expect(dark).toContain(`fill="${parseTokens(tokensCss, 'dark').get('--color-surface')}"`);
  });

  it('bounds = content + 48 px margin; empty designs are refused', () => {
    const d = golden('power'), routes = routeAll(d), b = contentBounds(d, routes)!;
    const e = exportSvg(d, { routes });
    expect(e.viewBox[0]).toBe(Math.floor(b.x - EXPORT_MARGIN));
    expect(e.viewBox[1]).toBe(Math.floor(b.y - EXPORT_MARGIN));
    expect(e.width).toBeGreaterThanOrEqual(b.w + 2 * EXPORT_MARGIN);
    expect(() => exportSvg(m.emptyDiagram())).toThrow(ExportError);
    const textOnly = m.addText(m.emptyDiagram(), { x: 10, y: 10 }, 'hello').data;
    expect(exportSvg(textOnly).source).toContain('hello');
  });

  it('extras hook adds drawing below / above and widens the bounds', () => {
    const d = golden('power');
    const e = exportSvg(d, { extras: () => ({ above: [h('circle', { cx: 5000, cy: 0, r: 1, class: 'af-junction' })], bounds: [{ x: 5000, y: 0, w: 1, h: 1 }] }) });
    expect(e.viewBox[0] + e.width).toBeGreaterThanOrEqual(5048);
    expect(e.source).toMatch(/<circle cx="5000"[^>]*fill=/);
  });

  it('styleDrawing leaves the input tree unchanged', () => {
    const n = h('rect', { class: 'af-block-body' });
    const out = styleDrawing(n);
    expect(n.attrs).toEqual({ class: 'af-block-body' });
    expect(out.attrs.fill).toBeTruthy();
  });

  it('file names', () => {
    expect(exportFileName('My: board?', 'Power tree', 'svg')).toBe('My board - Power tree.svg');
    expect(exportFileName('', '', 'png')).toBe('ArchFlow.png');
  });
});

describe('page layout (V2 pageExportDocument)', () => {
  it('fits and centres with a 3 % margin, at most 3×', () => {
    const e = exportSvg(golden('function'));
    for (const page of PAGE_SIZES) {
      const p = fitPage(e, page);
      if (page === 'native') { expect(p).toMatchObject({ width: e.width, height: e.height, scale: 1, source: e.source }); continue; }
      const [W, H] = page.split('x').map(Number), margin = Math.round(Math.min(W, H) * 0.03);
      expect(p.scale).toBeCloseTo(Math.min((W - 2 * margin) / e.width, (H - 2 * margin) / e.height, 3), 9);
      const s = structure(p.source);
      expect(s[0]).toMatchObject({ width: String(W), height: String(H), viewBox: `0 0 ${W} ${H}` });
      expect(wirePaths(s)).toEqual(wirePaths(structure(e.source)));
      expect(s.find(x => x.tag === 'g' && x.transform)!.transform).toContain(`translate(${-e.viewBox[0]},${-e.viewBox[1]})`);
    }
    const tiny = exportSvg(m.addText(m.emptyDiagram(), { x: 0, y: 0 }, 'x').data);
    expect(fitPage(tiny, '1920x1080').scale).toBe(3);
  });
});

describe('readability (V2 readabilityReport)', () => {
  const text = (notes: { key: MessageKey; vars?: Record<string, string | number> }[]) => notes.map(n => t(n.key, n.vars)).join(' ');

  it('matches the V2 formula and wording', () => {
    setLocale('zh-Hant');
    const d = golden('power'), routes = routeAll(d), e = exportSvg(d, { routes }), p = fitPage(e, '2560x1440');
    const r = readability(d, p, routes);
    const eff = p.scale * Math.min(1, 1366 / 2560, 768 / 1440);
    const title = Math.min(...d.blocks.map(b => b.style.titleSize ?? d.theme?.title ?? 20)) * eff;
    expect(r.title).toBeCloseTo(title, 9);
    expect(text(r.notes)).toContain('輸出 2560 × 1440；以 1366 × 768 螢幕完整顯示估算：IC 約');
    expect(r.warning).toBe(r.title < 16 || r.label < 10);
    expect(r.notes.map(n => n.key)).toEqual(['export.read.size', 'export.read.ok', 'export.read.estimate']);
  });

  it('warns about small text, invalid routes and overlapping text boxes', () => {
    setLocale('en');
    let d = golden('function');
    d = m.addText(d, { x: d.blocks[0].x + 5, y: d.blocks[0].y + 5 }, 'on top').data;
    const routes = routeAll(d);
    const fake = new Map(routes);
    const [id, r0] = [...routes][0];
    fake.set(id, { ...r0, valid: false });
    const r = readability(d, { width: 4000, height: 3000, scale: 0.2 }, fake);
    expect(r.warning).toBe(true);
    const s = text(r.notes);
    expect(s).toContain('Text may be too small');
    expect(s).toContain('1 wires have no valid route');
    expect(s).toMatch(/\d+ text boxes overlap/);
    expect(text(readability(m.emptyDiagram(), { width: 1, height: 1, scale: 1 }, new Map()).notes)).toBe(t('export.read.empty'));
  });
});
