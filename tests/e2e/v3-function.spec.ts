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

test('function: insert parts from the toolbar, edit a supply and voltage badges, export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();

  await page.getByLabel('插入零件').selectOption({ label: '電阻' });
  await page.getByLabel('插入零件').selectOption({ label: '電源符號' });
  await expect(page.locator('svg.af-canvas .af-part-glyph')).toHaveCount(2);
  // the supply is selected: change its voltage in the panel
  const volt = page.getByRole('complementary', { name: '屬性' }).getByLabel('電壓', { exact: true });
  await volt.fill('5v');
  await volt.press('Enter');
  await expect(page.locator('svg.af-canvas .af-part-value')).toHaveText('5V');
  // R turns the resistor
  await page.evaluate(() => { const s = (window as unknown as { archflow: { data(): { blocks: { id: string; part?: unknown }[] }; gestures: { select(x: unknown[]): void } } }).archflow; s.gestures.select([{ kind: 'block', id: s.data().blocks.find(b => b.part)!.id }]); });
  await page.locator('svg.af-canvas').focus();
  await page.keyboard.press('r');
  expect((await data(page)).blocks.find(b => (b as { part?: { rot: number } }).part)).toMatchObject({ part: { rot: 90 } });

  // voltage badges on the MCU block
  await page.evaluate(() => { const s = (window as unknown as { archflow: { data(): { blocks: { id: string }[] }; gestures: { select(x: unknown[]): void } } }).archflow; s.gestures.select([{ kind: 'block', id: s.data().blocks[1].id }]); });
  const rails = page.getByRole('complementary', { name: '屬性' }).getByLabel('電壓標示');
  await rails.fill('3v3, 1.8');
  await rails.press('Enter');
  await expect(page.locator('svg.af-canvas .af-rail-text')).toHaveText(['3.3V', '1.8V']);

  await page.getByRole('button', { name: '匯出' }).click();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: '下載' }).click()]);
  const source = fs.readFileSync(await svg.path(), 'utf8');
  expect(source).toContain('>3.3V<');
  expect(source).toContain('>5V<');
  expect(source).toContain('M0 20H30l3.3-8');
  expect(errors).toEqual([]);
});

test('function: frame around the selection, rename and recolour it, move it with its contents', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  type W = { archflow: { data(): { blocks: { id: string; x: number; y: number }[]; frames: { x: number; y: number; title: string; color: string }[] }; gestures: { select(x: unknown[]): void }; camera: { x: number; y: number; z: number } } };
  await page.evaluate(() => { const s = (window as unknown as W).archflow; s.gestures.select(s.data().blocks.slice(1, 3).map(b => ({ kind: 'block', id: b.id }))); });
  await page.getByRole('button', { name: '新增區域框' }).click();
  const panel = page.getByRole('complementary', { name: '屬性' });
  await panel.getByLabel('區域框名稱').fill('主控板');
  await panel.getByLabel('區域框名稱').press('Enter');
  await panel.getByRole('radio', { name: '藍' }).check();
  await expect(page.locator('svg.af-canvas .af-frame-name')).toHaveText('主控板');

  const before = await page.evaluate(() => (window as unknown as W).archflow.data());
  const f = before.frames[0];
  const box = (await page.locator('svg.af-canvas').boundingBox())!;
  const c = await page.evaluate(() => (window as unknown as W).archflow.camera);
  const sx = box.x + (f.x + 40) * c.z + c.x, sy = box.y + f.y * c.z + c.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 50, sy + 60, { steps: 5 });
  await page.mouse.up();
  const after = await page.evaluate(() => (window as unknown as W).archflow.data());
  const dx = after.frames[0].x - f.x;
  expect(dx).toBeGreaterThan(0);
  expect(after.blocks[1].x - before.blocks[1].x).toBe(dx);      // inside: moved with the frame
  expect(after.blocks[0].x).toBe(before.blocks[0].x);           // outside: stayed
  expect(after.frames[0]).toMatchObject({ title: '主控板', color: 'blue' });
  expect(errors).toEqual([]);
});
