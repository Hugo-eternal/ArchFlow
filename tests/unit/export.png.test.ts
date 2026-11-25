// module: export — V3 src/export/png.ts: size limits, and SVG → PNG in Chromium (the module
// bundled with esbuild and loaded into a blank page). Node environment: esbuild does not run in jsdom.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser } from '@playwright/test';
import { exportSvg, ExportError } from '../../src/export/svg';
import { pngSize, PNG_LIMITS } from '../../src/export/png';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const golden = (type: 'function' | 'power'): BlockDiagram => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/golden/${type}/__snapshots__/project.v3.json`), 'utf8'));
  return p.designs.find((d: { type: string; data: { view?: string } }) => d.type === 'function' && d.data.view === type).data;
};

describe('PNG', () => {
  let browser: Browser | undefined;
  afterAll(async () => { await browser?.close(); });

  it('refuses pictures over the V2 limits', () => {
    expect(pngSize(1000, 500, 2)).toEqual({ width: 2000, height: 1000 });
    expect(() => pngSize(PNG_LIMITS.side + 1, 10, 1)).toThrow(ExportError);
    expect(() => pngSize(9000, 9000, 1)).toThrow(ExportError);
  });

  it('renders the SVG in Chromium at the requested scale', async () => {
    const bundle = await build({ entryPoints: [path.join(ROOT, 'src/export/png.ts')], bundle: true, format: 'iife', globalName: 'AF', write: false });
    const e = exportSvg(golden('power'));
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const out = await page.evaluate(async ({ source, w, hh }) => {
      const AF = (window as unknown as { AF: typeof import('../../src/export/png') }).AF;
      const blob = await AF.svgToPng(source, w, hh, 2);
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let dark = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] < 128 && px[i + 3] > 0) dark++;
      return { type: blob.type, width: bmp.width, height: bmp.height, dark };
    }, { source: e.source, w: e.width, hh: e.height });
    expect(out).toMatchObject({ type: 'image/png', width: e.width * 2, height: e.height * 2 });
    expect(out.dark).toBeGreaterThan(1000);   // wires and text were drawn
  });
});
