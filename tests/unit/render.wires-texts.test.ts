// module: render — V3 src/render/wires.ts and texts.ts: wire paths, arrows and labels match
// V2.10.1 drawEdges on the golden function / power projects; text boxes wrap inside their width.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { openApp } from '../helpers/load-app.js';
import { loadGolden } from '../golden/golden.js';
import { convertProject } from '../tools/v2-to-v3';
import { routeAll } from '../../src/router/full-path';
import { wiresLayer, wireLabel, labelPosition, invalidCount } from '../../src/render/wires';
import { textsLayer, wrapText, estimateWidth, ptToPx } from '../../src/render/texts';
import { find, toMarkup, h } from '../../src/render/vnode';
import { simplify, type Point } from '../../src/core/geometry';
import type { BlockDiagram, TextBox, Wire } from '../../src/io/schema-types';

type App = Awaited<ReturnType<typeof openApp>>;
const parse = (d: string): Point[] => [...d.matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)].map(m => ({ x: +m[1], y: +m[2] }));

describe('render/wires matches V2 drawEdges', () => {
  let app: App;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const type of ['function', 'power'] as const) {
    it(`${type}: one path per wire with V2's points, arrows and labels`, async () => {
      await loadGolden(app, type);
      const v2 = await app.eval(() => {
        render(); drawEdges();
        const paths = [...document.querySelectorAll('#edges path.wire')].map(p => ({ d: p.getAttribute('d'), arrow: p.hasAttribute('marker-end') }));
        const labels = [...document.querySelectorAll('#edges .netlabel')].map(l => ({ text: l.textContent, x: +l.getAttribute('x'), y: +l.getAttribute('y') }));
        return { file: projectData(), ids: model.edges.map(e => e.id), paths, labels, junctions: model.junctions.length };
      });
      const d = convertProject(v2.file).designs.find(x => x.id === v2.file.activeDesignId)!.data as BlockDiagram;
      const routes = routeAll(d), layer = wiresLayer(d, routes);
      expect(invalidCount(routes)).toBe(0);
      const groups = find(layer, n => n.attrs['data-wire'] !== undefined);
      expect(groups.map(g => g.attrs['data-wire'])).toEqual(v2.ids);
      groups.forEach((g, i) => {
        const path = find(g, n => n.tag === 'path' && String(n.attrs.class).startsWith('af-wire '))[0];
        expect(parse(String(path.attrs.d)), v2.ids[i]).toEqual(simplify(parse(v2.paths[i].d!)));
        expect(!!path.attrs['marker-end'], v2.ids[i]).toBe(v2.paths[i].arrow);
      });
      // labels: same texts at the same anchor points, in the same order
      const mine = find(layer, n => n.attrs.class === 'af-wire-label').map(n => ({ text: n.text, x: +n.attrs.x!, y: +n.attrs.y! }));
      expect(mine).toEqual(v2.labels);
      if (type === 'power') expect(mine.length).toBeGreaterThan(0);
      expect(find(layer, n => n.attrs.class === 'af-junction').length).toBe(v2.junctions);
    });
  }
});

describe('render/wires', () => {
  const wire = (over: Partial<Wire> = {}): Wire => ({ id: 'w', a: { block: 'A', port: 'p' }, b: { block: 'B', port: 'q' }, name: 'SDA', kind: 'signal', line: { color: '', width: 2, dash: 'solid', arrow: true }, locked: false, ...over });
  it('label text and placement', () => {
    expect(wireLabel(wire())).toBe('SDA');
    expect(wireLabel(wire({ name: '', electrical: { voltage: '3.3', current: '200', unit: 'mA', show: true } }))).toBe('3.3 V · 200 mA');
    expect(wireLabel(wire({ electrical: { voltage: '5V', current: '', show: false } }))).toBe('SDA');
    expect(wireLabel(wire({ name: '', electrical: { voltage: '5V', current: '20', unit: 'uA', show: true } }))).toBe('5V · 20 \u00b5A');
    const ps = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 200 }, { x: 60, y: 200 }];
    expect(labelPosition(wire(), ps)).toEqual({ x: 38, y: 93, anchor: 'start' });
    expect(labelPosition(wire({ label: { mark: { x: 5, y: 6, angle: 0 } } }), ps)).toEqual({ x: 5, y: 6, anchor: 'middle' });
  });

  it('invalid routes get no arrow and the invalid class; junction ends get no arrow', () => {
    const d = { blocks: [], wires: [wire(), wire({ id: 'v', b: { junction: 'J' } })], junctions: [{ id: 'J', x: 0, y: 0, name: '' }] } as unknown as BlockDiagram;
    const routes = new Map([['w', { ps: [{ x: 0, y: 0 }, { x: 10, y: 0 }], valid: false, failed: true }], ['v', { ps: [{ x: 0, y: 0 }, { x: 0, y: 10 }], valid: true, failed: false }]]);
    const layer = wiresLayer(d, routes);
    const groups = find(layer, n => n.attrs['data-wire'] !== undefined);
    expect(String(groups[0].attrs.class)).toContain('is-invalid');
    expect(find(layer, n => !!n.attrs['marker-end'])).toHaveLength(0);
    expect(invalidCount(routes)).toBe(1);
  });
});

describe('render/texts', () => {
  it('wraps at spaces, between CJK characters, and splits over-long words', () => {
    const px = 16;
    expect(wrapText('a\nb', 500, px)).toEqual(['a', 'b']);
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 80, px);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(estimateWidth(l, px, false, false)).toBeLessThanOrEqual(80);
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog');
    const cjk = wrapText('電源輸入區塊說明', 40, px);
    expect(cjk.every(l => l.length <= 2)).toBe(true);
    expect(wrapText('x'.repeat(40), 50, px).every(l => estimateWidth(l, px, false, false) <= 50)).toBe(true);
    expect(wrapText('', 50, px)).toEqual(['']);
  });

  describe('in a real page', () => {
    let browser: Browser;
    beforeAll(async () => { browser = await chromium.launch(); });
    afterAll(async () => { await browser?.close(); });

    it('every line fits the box with real font metrics; style applies; text stays text', async () => {
      const t: TextBox = { id: 't1', text: 'Power-on sequence <b>notes</b>\nVDD first, then VIO and the core rails.', x: 10, y: 10, w: 180, size: 12, color: '#243e5d', bold: true, italic: false, align: 'center', background: '#fff7d6' };
      const css = fs.readFileSync('src/styles/tokens.css', 'utf8') + fs.readFileSync('src/styles/canvas.css', 'utf8');
      const page = await browser.newPage();
      // measure with the page's canvas, as the app does (render/texts canvasMeasure)
      await page.setContent(`<style>${css}</style><div id="out"></div>`);
      const widths: Record<string, number> = {};
      const words = [...new Set(t.text.split(/(\s+)/))];
      Object.assign(widths, await page.evaluate(([ws, px]) => { const c = document.createElement('canvas').getContext('2d')!; c.font = `700 ${px}px "Source Han Sans TC", sans-serif`; return Object.fromEntries((ws as string[]).map(w => [w, c.measureText(w).width])); }, [words, ptToPx(t.size)] as const));
      const measure = (s: string) => s.split(/(\s+)/).reduce((n, w) => n + (widths[w] ?? estimateWidth(w, ptToPx(t.size), true, false)), 0);
      const svg = toMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 400, height: 300 }, [textsLayer([t], { measure, selected: new Set(['t1']) })]));
      await page.evaluate(s => { document.getElementById('out')!.innerHTML = s; }, svg);
      const r = await page.evaluate(() => {
        const body = document.querySelector('.af-text-body') as SVGTextElement;
        const spans = [...body.querySelectorAll('tspan')] as SVGTextContentElement[];
        return { lines: spans.length, widest: Math.max(...spans.map(s => s.getComputedTextLength())), weight: getComputedStyle(body).fontWeight, bg: getComputedStyle(document.querySelector('.af-text-bg')!).fill, b: document.querySelectorAll('.af-text-body b').length, sel: !!document.querySelector('.af-text-selection') };
      });
      await page.close();
      expect(r.lines).toBeGreaterThan(2);
      expect(r.widest).toBeLessThanOrEqual(180 - 8 + 0.5);
      expect(r).toMatchObject({ weight: '700', bg: 'rgb(255, 247, 214)', b: 0, sel: true });
    });
  });
});
