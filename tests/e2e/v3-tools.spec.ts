// module: tools:bom, tools:edid, tools:hex, tools:pattern — V3 shell (dist/ArchFlow.html): the BOM tool opens from the start screen and
// from the workspace tools menu, shows its page, and closes through its host object (the V2
// vendor interface), the close button or Escape; its frame stays mounted, hidden.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HERE, '../../dist/ArchFlow.html');

test.use({ locale: 'zh-TW' });
test.skip(!fs.existsSync(DIST), 'run `npm run build` first');

test('RSI BOM Converter: start screen tile, workspace palette, closes three ways', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: /^RSI BOM Converter/ }).click();
  const dialog = page.getByRole('dialog', { name: 'RSI BOM Converter' });
  const frame = page.locator('iframe.af-tool-frame[title="RSI BOM Converter"]');
  await expect(dialog).toBeVisible();
  await expect(page.frameLocator('iframe.af-tool-frame[title="RSI BOM Converter"]').locator('body')).toContainText('把 BOM 轉成 RSI 格式', { timeout: 15000 });

  // the tool's own close (vendor host interface)
  await page.evaluate(() => (window as unknown as { afRsiHost: { close(): void } }).afRsiHost.close());
  await expect(frame).toBeHidden();
  await expect(frame).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'ArchFlow' })).toBeVisible();

  // from the workspace: the command palette (the V2.10.1 workspace has no tools menu); Escape and the close button
  await page.getByRole('button', { name: '建立專案' }).click();
  const open = async () => {
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: '搜尋' }).fill('RSI BOM');
    await page.keyboard.press('Enter');
  };
  await open();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await open();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '關閉' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('EDID Generator opens from the start screen, shows its page and closes through its host', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: /^EDID Generator/ }).click();
  const frame = page.locator('iframe.af-tool-frame[title="EDID Generator"]');
  await expect(frame).toBeVisible();
  await expect(page.frameLocator('iframe.af-tool-frame[title="EDID Generator"]').locator('body')).toContainText('產生 EDID 基本區塊', { timeout: 15000 });
  await page.evaluate(() => (window as unknown as { afEdidHost: { close(): void } }).afEdidHost.close());
  await expect(frame).toBeHidden();
  expect(errors).toEqual([]);
});

test('Hex/Bin Editor & Compare opens, loads a binary file and shows its bytes, closes through its host', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: /^Hex\/Bin Editor & Compare/ }).click();
  const hex = page.frameLocator('iframe.af-tool-frame[title="Hex/Bin Editor & Compare"]');
  await expect(hex.locator('body')).toContainText('支援的格式', { timeout: 15000 });
  await hex.locator('input[type=file]').first().setInputFiles({ name: 'sample.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x03]) });
  await expect(hex.locator('body')).toContainText(/DE\s*AD\s*BE\s*EF/i, { timeout: 10000 });
  await page.evaluate(() => (window as unknown as { afHexHost: { close(): void } }).afHexHost.close());
  await expect(page.locator('iframe.af-tool-frame[title="Hex/Bin Editor & Compare"]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Pattern Generator opens, shows its page and closes through its host', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: /^Pattern Generator/ }).click();
  const frame = page.locator('iframe.af-tool-frame[title="Pattern Generator"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('allow', /fullscreen/);
  await expect(page.frameLocator('iframe.af-tool-frame[title="Pattern Generator"]').locator('body')).toContainText('尺寸', { timeout: 15000 });
  await page.evaluate(() => (window as unknown as { afPgHost: { close(): void } }).afPgHost.close());
  await expect(frame).toBeHidden();
  expect(errors).toEqual([]);
});
