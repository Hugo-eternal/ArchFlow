// module: export, shell — export PNG / SVG through the shell's export dialog, and switch the
// interface language without losing the unsaved project.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openIndex, engine, createProject } from './helpers.js';

const pngSize = buf => ({ sig: buf.subarray(0, 8).toString('hex'), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

// The app names the file through <a download="…">. Headless Chromium under Playwright reports
// the download as "download" because the blob URL has an opaque origin (blob:null/…, srcdoc
// iframe opened from file://); real Chrome / Edge save it with the right name (confirmed by
// the user). We therefore record the name the app asked for, and read the bytes from the
// real download.
async function exportAs(page, app, info, format, opts = {}) {
  await engine(page).evaluate(() => {
    if (window.__e2eAnchorHook) return;
    window.__e2eAnchorHook = true;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__e2eLastDownload = this.download; return click.call(this); };
  });
  // the export dialog stays open after an export; open it only when needed
  if (!(await engine(page).evaluate(() => document.getElementById('exportDialog')?.open))) {
    await app.getByRole('button', { name: '匯出', exact: true }).click();
  }
  await app.locator('#exportFormat').selectOption(format);
  if (opts.page) await app.locator('#exportPage').selectOption(opts.page);
  if (opts.scale) await app.locator('#exportScale').selectOption(opts.scale);
  const [d] = await Promise.all([page.waitForEvent('download'), app.locator('#doExport').click()]);
  const name = await engine(page).evaluate(() => window.__e2eLastDownload);
  const file = info.outputPath(name || d.suggestedFilename());
  await d.saveAs(file);
  return { name, browserName: d.suggestedFilename(), buf: fs.readFileSync(file) };
}

test('export the function example as PNG and SVG', async ({ page }, info) => {
  const { app, errors } = await openIndex(page);
  await createProject(page, app, { name: 'E2E 匯出', start: '範本' });
  const pages = await app.locator('#exportPage option').evaluateAll(os => os.map(o => o.value));

  const svg = await exportAs(page, app, info, 'svg');
  expect(svg.name).toBe('入門方塊圖.svg'); // design name + extension (L565)
  const text = svg.buf.toString('utf8');
  expect(text.startsWith('<svg')).toBe(true);
  for (const title of await engine(page).evaluate(() => model.nodes.map(n => n.title))) expect(text).toContain(title);

  // first page preset is "PPT 2560 × 1440"; at 1× the PNG has exactly that size
  const png = await exportAs(page, app, info, 'png', { page: pages[0], scale: '1' });
  expect(png.name).toBe('入門方塊圖.png');
  expect(pngSize(png.buf)).toEqual({ sig: '89504e470d0a1a0a', w: 2560, h: 1440 });

  expect(errors).toEqual([]);
});

test('switching to English keeps the unsaved project', async ({ page }) => {
  const { app, errors } = await openIndex(page);
  await createProject(page, app, { name: 'E2E 語系', start: '範本' });
  await app.getByRole('button', { name: /新增方塊/ }).first().click();
  const before = await engine(page).evaluate(() => ({ name: projectMeta.name, nodes: model.nodes.length, dirty: projectMeta.dirty }));
  expect(before.dirty).toBe(true);

  await app.getByRole('radio', { name: 'EN' }).first().click();
  await expect(app.getByRole('button', { name: 'Export', exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(() => engine(page).evaluate(() => document.documentElement.lang)).toBe('en');
  const after = await engine(page).evaluate(() => ({ name: projectMeta.name, nodes: model.nodes.length, dirty: projectMeta.dirty }));
  expect(after).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('archflow-language-v2'))).toBe('en');

  // and back to Chinese
  await app.getByRole('radio', { name: '中' }).first().click();
  await expect(app.getByRole('button', { name: '匯出', exact: true })).toBeVisible({ timeout: 20000 });
  expect(await engine(page).evaluate(() => model.nodes.length)).toBe(before.nodes);
  expect(errors).toEqual([]);
});
