// module: designs:flowchart — V3 shell (dist/ArchFlow.html) with the vendor flowchart editor in its
// iframe: template loads, an edit comes back to the project, the shell's undo goes to the
// editor, the saved file holds the chart, export opens the editor's own dialog.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HERE, '../../dist/ArchFlow.html');

test.use({ locale: 'zh-TW' });
test.skip(!fs.existsSync(DIST), 'run `npm run build` first');

const nodes = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { archflow: { store: { activeDesignId: string; data(id: string): { nodes: unknown[] } } } }).archflow;
  return a.store.data(a.store.activeDesignId).nodes.length;
});

test('flowchart: template in the vendor editor, edits saved, undo through the shell, export dialog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '流程圖' }).check();
  await expect(page.getByRole('radio', { name: '範本：LCD 面板上電流程' })).toBeChecked();
  await page.getByRole('button', { name: '建立專案' }).click();

  const frame = page.frameLocator('iframe[title="流程圖編輯器"]');
  await expect(frame.getByText('上電開始').first()).toBeVisible();
  await expect(page.locator('.af-statusbar')).toContainText('16 個圖形');
  await expect(page.locator('.af-unsaved')).toHaveCount(0);
  const n = await nodes(page);

  // add a shape from the editor's palette
  await frame.getByRole('button', { name: /^處理/ }).first().click();
  await expect.poll(() => nodes(page)).toBe(n + 1);
  await expect(page.locator('.af-unsaved')).toBeVisible();

  await page.getByRole('button', { name: '復原' }).click();
  await expect.poll(() => nodes(page)).toBe(n);

  const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '儲存' }).click()]);
  const file = JSON.parse(fs.readFileSync(await save.path(), 'utf8'));
  expect(file.designs[0]).toMatchObject({ type: 'flowchart', name: 'LCD 面板上電流程' });
  expect(file.designs[0].data.nodes).toHaveLength(n);

  // export: the editor's own export menu (SVG / PNG / Mermaid …)
  await page.getByRole('button', { name: '匯出' }).click();
  await expect(frame.locator('button', { hasText: 'Mermaid' })).toBeVisible();
  expect(errors).toEqual([]);
});
