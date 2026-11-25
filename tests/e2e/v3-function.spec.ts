// module: designs:function — V3 shell (dist/ArchFlow.html): start a project from the function
// starter template, add a blank function design next to it, save, and check the file.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HERE, '../../dist/ArchFlow.html');

test.use({ locale: 'zh-TW' });
test.skip(!fs.existsSync(DIST), 'run `npm run build` first');

const data = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { archflow: { data(): unknown } }).archflow.data())) as { blocks: { title: string; partNumber: string }[]; wires: unknown[] });

test('function: starter template, then a blank design, then save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);

  await expect(page.getByRole('radio', { name: '功能方塊圖' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '範本：入門方塊圖' })).toBeChecked();
  await page.getByRole('button', { name: '建立專案' }).click();
  await expect(page.getByRole('button', { name: /入門方塊圖/ })).toHaveAttribute('aria-current', 'page');
  const d = await data(page);
  expect(d.blocks.map(b => b.partNumber)).toEqual(['感測器', '微控制器', '無線模組', '電源']);
  expect(d.wires).toHaveLength(3);
  await expect(page.locator('svg.af-canvas [data-wire]')).toHaveCount(3);
  await expect(page.locator('svg.af-canvas')).toContainText('四個方塊、三條連線');
  // the template is fitted into view
  expect(await page.evaluate(() => (window as unknown as { archflow: { camera: { z: number } } }).archflow.camera.z)).not.toBe(1);

  // blank design via the new-design dialog
  await page.getByRole('button', { name: '新增設計' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('radio', { name: '空白設計' }).check();
  await dlg.getByLabel('設計名稱').fill('空白');
  await dlg.getByRole('button', { name: '確定' }).click();
  await expect(page.getByRole('button', { name: /空白/ })).toHaveAttribute('aria-current', 'page');
  expect((await data(page)).blocks).toHaveLength(0);

  const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '儲存' }).click()]);
  const file = JSON.parse(fs.readFileSync(await save.path(), 'utf8'));
  expect(file.designs.map((x: { type: string; name: string }) => `${x.type}:${x.name}`)).toEqual(['function:入門方塊圖', 'function:空白']);
  expect(file.designs[0].data.blocks).toHaveLength(4);
  expect(errors).toEqual([]);
});
