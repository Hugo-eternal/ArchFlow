// module: designs:sequence — V3 shell (dist/ArchFlow.html) with the vendor power-sequence editor in
// its iframe: template loads, edits come back to the project (unsaved mark, saved file), the
// shell's undo goes to the editor, export opens the editor's own dialog.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HERE, '../../dist/ArchFlow.html');

test.use({ locale: 'zh-TW' });
test.skip(!fs.existsSync(DIST), 'run `npm run build` first');

const rails = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { archflow: { store: { activeDesignId: string; data(id: string): { rails: unknown[] } } } }).archflow;
  return a.store.data(a.store.activeDesignId).rails.length;
});

test('sequence: template in the vendor editor, edits saved, undo through the shell, export dialog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '上電時序設計' }).check();
  await expect(page.getByRole('radio', { name: /^車用顯示控制器/ })).toBeChecked();
  await page.getByRole('button', { name: '建立專案' }).click();

  const frame = page.frameLocator('iframe[title="上電時序編輯器"]');
  await expect(frame.getByText('VBAT（KL30）').first()).toBeVisible();
  await expect(page.locator('.af-statusbar')).toContainText('全部上電完成於');
  await expect(page.locator('.af-save-state[data-state="dirty"]')).toHaveCount(0);
  const n = await rails(page);
  expect(n).toBe(12);

  // an edit inside the editor comes back to the project
  await frame.getByRole('button', { name: '新增電源軌' }).first().click();
  await expect.poll(() => rails(page)).toBe(n + 1);
  await expect(page.locator('.af-save-state[data-state="dirty"]')).toBeVisible();

  // the shell's undo (Ctrl+Z outside the frame) is the editor's undo
  await page.locator('.af-brand').click();
  await page.keyboard.press('Control+z');
  await expect.poll(() => rails(page)).toBe(n);

  const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '儲存', exact: true }).click()]);
  const file = JSON.parse(fs.readFileSync(await save.path(), 'utf8'));
  expect(file.designs[0]).toMatchObject({ type: 'sequence', name: '車用顯示控制器' });
  expect(file.designs[0].data.rails).toHaveLength(n);

  // export: the editor's own dialog
  await page.getByRole('button', { name: '匯出' }).click();
  await expect(frame.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
});
