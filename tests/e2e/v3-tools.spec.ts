// module: tools:bom — V3 shell (dist/ArchFlow.html): the BOM tool opens from the start screen and
// from the workspace tools menu, shows its page, and closes through its host object (the V2
// vendor interface), the close button or Escape; its frame stays mounted, hidden.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HERE, '../../dist/ArchFlow.html');

test.use({ locale: 'zh-TW' });
test.skip(!fs.existsSync(DIST), 'run `npm run build` first');

test('RSI BOM Converter: start screen tile, workspace menu, closes three ways', async ({ page }) => {
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

  // from the workspace tools menu; Escape and the close button
  await page.getByRole('button', { name: '建立專案' }).click();
  await page.getByLabel('小工具').selectOption({ label: 'RSI BOM Converter' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByLabel('小工具').selectOption({ label: 'RSI BOM Converter' });
  await dialog.getByRole('button', { name: '關閉' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
