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

  await expect(page.getByRole('radio', { name: '方塊圖', exact: true })).toBeChecked();
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

test('function: LCD module template and connector settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '空白設計' }).check();
  await page.getByRole('button', { name: '建立專案' }).click();
  await page.getByLabel('插入零件').selectOption({ label: 'LCD 模組' });
  await expect(page.getByRole('status').first()).toContainText('已加入 LCD 模組範本');
  let d = await data(page);
  expect(d.blocks).toHaveLength(8);
  expect(d.wires).toHaveLength(9);
  await expect(page.locator('svg.af-canvas .af-frame-name')).toHaveText('LCD 面板');
  await expect(page.locator('svg.af-canvas .af-conn-title')).toHaveText('CN1');
  // one undo removes the whole template
  await page.getByRole('button', { name: '復原' }).click();
  expect((await data(page)).blocks).toHaveLength(0);
  await page.getByRole('button', { name: '重做' }).click();

  // select the connector and give it 8 pins on the right only
  await page.evaluate(() => { const s = (window as unknown as { archflow: { data(): { blocks: { id: string; partNumber: string }[] }; gestures: { select(x: unknown[]): void } } }).archflow; s.gestures.select([{ kind: 'block', id: s.data().blocks.find(b => b.partNumber === 'CN1')!.id }]); });
  const panel = page.getByRole('complementary', { name: '屬性' });
  await panel.getByRole('radio', { name: '右' }).check();
  const count = panel.getByLabel('腳位數');
  await count.fill('8');
  await count.press('Enter');
  await expect(page.locator('svg.af-canvas .af-conn-num')).toHaveCount(8);
  d = await data(page);
  expect(d.wires.length).toBeLessThan(9);       // wires on the removed left side are gone
  expect(errors).toEqual([]);
});

test('function: switch between the function and power views (button, Shift+V), saved, not undoable, export view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();

  const views = page.getByRole('group', { name: '檢視' });
  const fn = views.getByRole('button', { name: '功能檢視' }), pw = views.getByRole('button', { name: '電源檢視' });
  await expect(fn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('svg.af-canvas .af-wire-group.is-muted')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '復原' })).toBeDisabled();

  await pw.click();
  await expect(pw).toHaveAttribute('aria-pressed', 'true');
  // signal wires fade in the power view; the project is unsaved; nothing to undo
  const signal = (await data(page)).wires.filter(w => (w as { kind: string }).kind !== 'power').length;
  expect(signal).toBeGreaterThan(0);
  await expect(page.locator('svg.af-canvas .af-wire-group.is-muted')).toHaveCount(signal);
  await expect(page.locator('.af-unsaved')).toBeVisible();
  await expect(page.getByRole('button', { name: '復原' })).toBeDisabled();

  // Shift+V on the canvas goes back
  await page.locator('svg.af-canvas').focus();
  await page.keyboard.press('Shift+V');
  await expect(fn).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+V');
  await expect(pw).toHaveAttribute('aria-pressed', 'true');

  // the export dialog starts on the current view and can pick the other one
  await page.getByRole('button', { name: '匯出' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('radio', { name: /電源檢視/ })).toBeChecked();
  await dlg.getByRole('radio', { name: /功能檢視/ }).check();
  const [svg] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: '下載' }).click()]);
  expect(fs.readFileSync(await svg.path(), 'utf8')).not.toMatch(/opacity="0\.35"/);

  // saved with the file
  const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '儲存' }).click()]);
  expect(JSON.parse(fs.readFileSync(await save.path(), 'utf8')).designs[0].data.view).toBe('power');
  expect(errors).toEqual([]);
});

test('function: power view — power settings in the panel, metric strip on the block and in the export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  const panel = page.getByRole('complementary', { name: '屬性' });
  const select = (i: number) => page.evaluate(n => { const s = (window as unknown as { archflow: { data(): { blocks: { id: string }[] }; gestures: { select(x: unknown[]): void } } }).archflow; s.gestures.select([{ kind: 'block', id: s.data().blocks[n].id }]); }, i);

  // function view: no power fields
  await select(3);
  await expect(panel.getByLabel('電壓', { exact: true })).toHaveCount(0);

  await expect(page.getByLabel('插入零件')).toBeVisible();
  await page.getByRole('group', { name: '檢視' }).getByRole('button', { name: '電源檢視' }).click();
  // the insert menu follows the view (3.29b e)
  await expect(page.getByLabel('插入零件')).toHaveCount(0);
  await page.getByLabel('插入電源方塊').selectOption({ label: '負載' });
  expect((await data(page)).blocks.at(-1)).toMatchObject({ partNumber: '負載' });
  await page.getByRole('button', { name: '復原' }).click();
  await select(3);
  const volt = panel.getByLabel('電壓', { exact: true });
  await volt.fill('5');
  await volt.press('Enter');
  // typing a value switched the figure on: the strip shows it
  await expect(panel.getByLabel('在圖面顯示電壓')).toBeChecked();
  await expect(page.locator('svg.af-canvas .af-metrics .af-metric-value')).toHaveText(['5']);
  await expect(page.locator('svg.af-canvas .af-metrics .af-metric-key')).toHaveText(['電壓']);
  // one undo step removes it
  await page.getByRole('button', { name: '復原' }).click();
  await expect(page.locator('svg.af-canvas .af-metrics')).toHaveCount(0);
  await page.getByRole('button', { name: '重做' }).click();

  // back in the function view the strip is gone, the value stays
  await page.keyboard.press('Shift+V');
  await expect(page.locator('svg.af-canvas .af-metrics')).toHaveCount(0);
  expect((await data(page)).blocks[3]).toMatchObject({ metrics: { voltage: { value: '5', show: true } } });

  await page.getByRole('button', { name: '匯出' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('radio', { name: /電源檢視/ }).check();
  const [svg] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: '下載' }).click()]);
  expect(fs.readFileSync(await svg.path(), 'utf8')).toContain('>電壓<');
  expect(errors).toEqual([]);
});

test('function: the starter power tree template opens in the power view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();

  await page.getByRole('button', { name: '新增設計' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('radio', { name: '範本：入門電源樹' }).check();
  await dlg.getByRole('button', { name: '確定' }).click();
  await expect(page.getByRole('button', { name: /分散式電源架構/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: '檢視' }).getByRole('button', { name: '電源檢視' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('svg.af-canvas .af-metrics')).toHaveCount(5);
  await expect(page.locator('svg.af-canvas [data-role="source"]')).toHaveCount(1);
  // the voltage legend overlay (3.29b d)
  await expect(page.getByRole('complementary', { name: '電壓顏色' })).toContainText('12V');
  // the first design keeps its own view
  await page.getByRole('button', { name: /入門方塊圖/ }).click();
  await expect(page.getByRole('group', { name: '檢視' }).getByRole('button', { name: '功能檢視' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('organize (3.38): nothing to apply on a tidy diagram; routes mode keeps blocks and undoes in one step; layered layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  const dialog = page.getByRole('dialog', { name: '自動整理' });
  const apply = dialog.getByRole('button', { name: '套用' });

  // the starter template is tidy: no candidate can be applied
  await page.getByRole('button', { name: '自動整理' }).click();
  await expect(apply).toBeDisabled();
  await dialog.getByRole('button', { name: '取消' }).click();

  // scramble the blocks (one undo step)
  await page.evaluate(() => { const s = (window as unknown as { archflow: { edit(f: (d: { blocks: { x: number; y: number }[]; wires: { route?: unknown }[] }) => unknown): void } }).archflow; s.edit(d => ({ ...d, blocks: d.blocks.map((b, i) => ({ ...b, x: [700, 60, 720, 80][i], y: [400, 420, 40, 60][i] })), wires: d.wires.map(w => ({ ...w, route: undefined })) })); });
  const before = await data(page) as unknown as { blocks: { x: number; y: number }[]; wires: { route?: unknown }[] };

  await page.getByRole('button', { name: '自動整理' }).click();
  await expect(dialog.getByText('可套用').first()).toBeVisible();
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toHaveCount(0);
  const after = await data(page) as unknown as { blocks: { x: number; y: number }[]; wires: { route?: unknown }[] };
  expect(after.blocks.map(b => [b.x, b.y])).toEqual(before.blocks.map(b => [b.x, b.y]));
  expect(after.wires.some(w => w.route)).toBe(true);
  await page.getByRole('button', { name: '復原' }).click();
  expect((await data(page) as unknown as { wires: { route?: unknown }[] }).wires.some(w => w.route)).toBe(false);

  // rearrange blocks: the layered candidate
  await page.getByRole('button', { name: '自動整理' }).click();
  await dialog.getByRole('radio', { name: '重新排列方塊' }).check();
  await dialog.getByRole('radio', { name: '依連接關係分層' }).check();
  await expect(apply).toBeEnabled();
  await apply.click();
  const g = await data(page) as unknown as { blocks: { x: number; y: number; w: number; h: number }[] };
  expect(g.blocks.map(b => [b.x, b.y])).not.toEqual(before.blocks.map(b => [b.x, b.y]));
  for (let i = 0; i < g.blocks.length; i++) for (let j = i + 1; j < g.blocks.length; j++) {
    const a = g.blocks[i], b = g.blocks[j];
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('block size and text (3.43c): width field, corner drag with text scaling, hide the main name', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  const block = (i: number) => page.evaluate(n => JSON.parse(JSON.stringify((window as unknown as { archflow: { data(): { blocks: unknown[] } } }).archflow.data().blocks[n])), i) as Promise<{ id: string; x: number; y: number; w: number; h: number; showTitle: boolean; style: { titleSize?: number } }>;
  const panel = page.getByRole('complementary', { name: '屬性' });

  const b = await block(1);
  await page.locator(`svg.af-canvas [data-block="${b.id}"] .af-block-body`).click({ position: { x: 20, y: 20 }, force: true });
  await expect(panel.getByText('尺寸與字級')).toBeVisible();
  const w = panel.getByLabel('寬', { exact: true });
  await w.fill(String(b.w + 40));
  await w.press('Enter');
  await expect.poll(async () => (await block(1)).w).toBe(b.w + 40);

  // drag the grip at the bottom-right corner: bigger, text follows (the preference is on)
  const grip = page.locator('svg.af-canvas .af-block-handle');
  await expect(grip).toHaveCount(1);
  const g = (await grip.boundingBox())!;
  const before = await block(1);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 80, g.y + 60, { steps: 5 });
  await page.mouse.up();
  const after = await block(1);
  expect(after.w).toBeGreaterThan(before.w);
  expect(after.style.titleSize ?? 0).toBeGreaterThan(before.style.titleSize ?? 0);
  await page.getByRole('button', { name: '復原' }).click();
  await expect.poll(async () => (await block(1)).w).toBe(before.w);

  // no main name (undo cleared the selection: select again)
  await page.locator(`svg.af-canvas [data-block="${b.id}"] .af-block-body`).click({ position: { x: 20, y: 20 }, force: true });
  await panel.getByLabel('顯示主名稱').uncheck();
  await expect(page.locator(`svg.af-canvas [data-block="${b.id}"] .af-block-title`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('wire path editing (3.43d): segment and corner handles, Shift-drag a pin', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  const wires = () => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { archflow: { data(): { wires: { id: string; route?: { x: number; y: number }[]; routing?: string }[] } } }).archflow.data().wires)));

  // select the vertical power wire (3V3) by clicking it
  const w = (await wires())[2];
  const path = page.locator(`svg.af-canvas [data-wire="${w.id}"] path`).first();
  const box = (await path.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const handles = page.locator('svg.af-canvas .af-segment-handle');
  await expect(handles).toHaveCount(1);
  const h = (await handles.first().boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await wires())[2].routing).toBe('manual');
  // now there are corners
  await expect(page.locator('svg.af-canvas .af-corner-handle')).not.toHaveCount(0);
  await page.getByRole('button', { name: '復原' }).click();
  await expect.poll(async () => (await wires())[2].routing).toBeUndefined();

  // Shift-drag a pin of the MCU to its bottom edge
  const d = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { archflow: { data(): unknown; camera: unknown } }).archflow.data())));
  const mcu = (d as { blocks: { id: string; x: number; y: number; w: number; h: number; ports: { id: string; side: string; t: number }[] }[] }).blocks[1];
  const port = page.locator(`svg.af-canvas [data-block="${mcu.id}"] .af-port[data-side="l"] .af-port-dot`).first();
  const pb = (await port.boundingBox())!;
  const body = (await page.locator(`svg.af-canvas [data-block="${mcu.id}"] .af-block-body`).boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width * 0.3, body.y + body.height - 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const after = await page.evaluate(id => (window as unknown as { archflow: { data(): { blocks: { id: string; ports: { side: string }[] }[] } } }).archflow.data().blocks.find(b => b.id === id)!.ports.map(p => p.side), mcu.id);
  const count = (sides: string[], x: string) => sides.filter(v => v === x).length;
  expect(count(after, 'l')).toBe(count(mcu.ports.map(p => p.side), 'l') - 1);
  expect(count(after, 'b')).toBe(count(mcu.ports.map(p => p.side), 'b') + 1);
  expect(errors).toEqual([]);
});
