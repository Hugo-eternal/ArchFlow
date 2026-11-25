// module: render — V3 src/render/blocks.ts + vnode.ts: block outlines, port positions and titles
// match V2.10.1 on the golden function / power projects; the markup renders with the tokens.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { openApp } from '../helpers/load-app.js';
import { loadGolden } from '../golden/golden.js';
import { convertProject } from '../tools/v2-to-v3';
import { blocksLayer, blockLines, metricText } from '../../src/render/blocks';
import { find, toMarkup, h } from '../../src/render/vnode';
import type { BlockDiagram } from '../../src/io/schema-types';
import * as m from '../../src/model/diagram';

type App = Awaited<ReturnType<typeof openApp>>;
const num = (v: unknown) => Number(v);

describe('render/blocks matches V2 geometry', () => {
  let app: App;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const type of ['function', 'power'] as const) {
    it(`${type}: block outlines, port centres and titles`, async () => {
      await loadGolden(app, type);
      const v2 = await app.eval(() => {
        render(); drawEdges();
        return {
          file: projectData(),
          blocks: model.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, ...size(n), part: !!n.afSym,
            title: document.getElementById(n.id)?.querySelector('.title')?.textContent ?? '',
            ports: n.ports.map(p => ({ id: p.id, ...anchor({ node: n.id, port: p.id }) })) })),
        };
      });
      const d = convertProject(v2.file).designs.find(x => x.id === v2.file.activeDesignId)!.data as BlockDiagram;
      const layer = blocksLayer(d);
      for (const b of v2.blocks) {
        const g = find(layer, n => n.attrs['data-block'] === b.id)[0];
        expect(g, b.id).toBeTruthy();
        const body = find(g, n => n.attrs.class === 'af-block-body')[0];
        if (b.part) expect(body).toBeUndefined();
        else expect([body.attrs.x, body.attrs.y, body.attrs.width, body.attrs.height].map(num), b.id).toEqual([b.x, b.y, b.w, b.h]);
        for (const p of b.ports) {
          const dot = find(g, n => n.tag === 'circle' && find(g, q => q.attrs['data-port'] === p.id)[0]?.children.includes(n))[0];
          expect([num(dot.attrs.cx), num(dot.attrs.cy)], `${b.id}/${p.id}`).toEqual([Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
        }
        const title = find(g, n => n.attrs.class === 'af-block-title')[0];
        // V2 shows "未命名 IC" for a block with neither part number nor title; V3 shows nothing
        if (b.title && b.title !== '未命名 IC') expect(title?.text, b.id).toBe(b.title);
      }
      expect(v2.blocks.length).toBeGreaterThan(3);
    });
  }
});

describe('render/blocks markup in a real page', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch(); });
  afterAll(async () => { await browser?.close(); });

  it('tokens and per-block colours apply; text is never parsed as markup', async () => {
    let d = m.emptyDiagram();
    const A = { ...m.makeBlock(d, { x: 20, y: 20 }), id: 'A', title: 'MCU', partNumber: 'STM32<b>', style: { fill: '#ffeecc' } };
    d = m.addBlock(d, A).data;
    const B = { ...m.makeBlock(d, { x: 320, y: 20 }), id: 'B', title: 'PMIC', titleAlign: 'top-left' as const, style: { titleSize: 30 } };
    d = m.addBlock(d, B).data;
    d = m.updatePort(d, 'B', B.ports[0].id, { label: 'outside' });
    const svg = toMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 600, height: 200 }, [blocksLayer(d, { selected: new Set(['A']) })]));
    const css = fs.readFileSync('src/styles/tokens.css', 'utf8') + fs.readFileSync('src/styles/canvas.css', 'utf8');
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style>${svg}`);
    const r = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!;
      const fill = (s: string) => getComputedStyle(q(s)).fill;
      return {
        aFill: fill('[data-block="A"] .af-block-body'), bFill: fill('[data-block="B"] .af-block-body'),
        aTitle: q('[data-block="A"] .af-block-title').textContent, bold: document.querySelectorAll('b').length,
        bSize: getComputedStyle(q('[data-block="B"] .af-block-title')).fontSize,
        selection: !!q('[data-block="A"] .af-block-selection'),
        outside: (q('[data-block="B"] .af-port-label') as SVGGraphicsElement).getBBox().x < 320,
        inside: (q('[data-block="A"] .af-port-label') as SVGGraphicsElement).getBBox().x >= 20,
      };
    });
    await page.close();
    expect(r).toEqual({ aFill: 'rgb(255, 238, 204)', bFill: 'rgb(234, 240, 246)', aTitle: 'STM32<b>', bold: 0, bSize: '30px', selection: true, outside: true, inside: true });
  });
});

describe('render/blocks text', () => {
  it('lines and metrics', () => {
    const b = m.makeBlock(m.emptyDiagram(), { x: 0, y: 0 });
    expect(blockLines({ ...b, partNumber: 'TPS5430', title: 'Buck', subtitle: '5V→3V3' })).toEqual({ title: 'TPS5430', second: 'Buck', subtitle: '5V→3V3' });
    expect(blockLines({ ...b, partNumber: '', title: 'Buck', showTitle: false }).title).toBe('');
    expect(metricText('voltage', { value: '3.3', show: true })).toBe('3.3 V');
    expect(metricText('current', { value: '500', show: true, unit: 'mA' })).toBe('500 mA');
    expect(metricText('efficiency', { value: '92%', show: true })).toBe('92%');
    expect(metricText('efficiency', { value: '90', show: true })).toBe('90%');
    expect(metricText('power', { value: ' ', show: true })).toBe('');
  });
});
