// module: shell — V3 minimal shell (dist/ArchFlow.html, built by `npm run build`): create a
// function project, add blocks, drag, draw a wire, edit in the properties panel, undo, save,
// export SVG, reopen the saved file, and refuse a V2 project file. Actions go through the UI;
// `window.archflow` is only read to find on-screen positions and to check the model.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HERE, '../../dist/ArchFlow.html');
const V2_FILE = path.resolve(HERE, '../golden/function/project.json');

test.use({ locale: 'zh-TW' });
test.skip(!fs.existsSync(DIST), 'run `npm run build` first');

interface Snapshot { blocks: { id: string; x: number; y: number; w: number; h: number; title: string; ports: { id: string; side: string; t: number; name: string }[] }[]; wires: { id: string }[] }
const model = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { archflow: { data(): unknown } }).archflow;
  return JSON.parse(JSON.stringify(s.data())) as Snapshot;
});
/** Screen position of a diagram point. */
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('svg.af-canvas').boundingBox())!;
  const c = await page.evaluate(() => (window as unknown as { archflow: { camera: { x: number; y: number; z: number } } }).archflow.camera);
  return { x: box.x + x * c.z + c.x, y: box.y + y * c.z + c.y };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}
/** File names the app asked for (Playwright reports "download" for blob: URLs from file://, see 2.15). */
async function trackDownloads(page: Page) {
  await page.addInitScript(() => {
    const names: string[] = ((window as unknown as { __downloads: string[] }).__downloads = []);
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (this.download) names.push(this.download); return click.call(this); };
  });
}
const lastDownload = (page: Page) => page.evaluate(() => (window as unknown as { __downloads: string[] }).__downloads.at(-1));

const portPos = (b: Snapshot['blocks'][number], name: string) => {
  const p = b.ports.find(q => q.name === name)!;
  return p.side === 'l' ? { x: b.x, y: b.y + b.h * p.t } : p.side === 'r' ? { x: b.x + b.w, y: b.y + b.h * p.t } : p.side === 't' ? { x: b.x + b.w * p.t, y: b.y } : { x: b.x + b.w * p.t, y: b.y + b.h };
};

test('build a small function diagram in the V3 shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await trackDownloads(page);
  await page.goto('file://' + DIST);

  // start screen → new project
  await page.getByLabel('專案名稱').fill('主機板');
  await page.getByRole('radio', { name: '空白設計' }).check();
  await page.getByRole('button', { name: '建立專案' }).click();
  await expect(page.getByRole('navigation', { name: '設計清單' }).getByRole('button', { name: /設計 1/ })).toBeVisible();

  // two blocks; move the second one to the right
  await page.getByRole('button', { name: '新增方塊' }).click();
  await page.getByRole('button', { name: '新增方塊' }).click();
  let m = await model(page);
  expect(m.blocks).toHaveLength(2);
  const b2 = m.blocks[1];
  await drag(page, await screen(page, b2.x + b2.w / 2, b2.y + 20), await screen(page, b2.x + b2.w / 2 + 320, b2.y + 20));
  m = await model(page);
  expect(m.blocks[1].x).toBeGreaterThan(m.blocks[0].x + 250);

  // wire: OUT of the first block → IN of the second
  const [a, b] = m.blocks;
  const out = portPos(a, 'OUT'), inn = portPos(b, 'IN');
  await drag(page, await screen(page, out.x, out.y), await screen(page, inn.x, inn.y));
  m = await model(page);
  expect(m.wires).toHaveLength(1);
  await expect(page.locator('svg.af-canvas [data-wire]')).toHaveCount(1);

  // select the first block and rename it in the properties panel
  await page.mouse.click(...Object.values(await screen(page, a.x + a.w / 2, a.y + a.h - 15)) as [number, number]);
  const title = page.getByRole('complementary', { name: '屬性' }).getByLabel('簡短功能名稱');
  await title.fill('PMIC');
  await title.press('Enter');
  await expect.poll(async () => (await model(page)).blocks[0].title).toBe('PMIC');
  await expect(page.locator('svg.af-canvas')).toContainText('PMIC');

  // undo the rename (toolbar button), then redo with the keyboard
  await page.getByRole('button', { name: '復原' }).click();
  await expect.poll(async () => (await model(page)).blocks[0].title).toBe('');
  await page.locator('svg.af-canvas').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect.poll(async () => (await model(page)).blocks[0].title).toBe('PMIC');

  // second design, then back
  await page.getByRole('button', { name: '新增設計' }).click();
  await page.getByRole('dialog').getByLabel('設計名稱').fill('電源樹');
  await page.getByRole('dialog').getByRole('button', { name: '確定' }).click();
  await expect(page.getByRole('button', { name: /電源樹/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: /設計 1/ }).click();
  expect((await model(page)).blocks).toHaveLength(2);

  // save
  const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '儲存' }).click()]);
  expect(await lastDownload(page)).toBe('主機板.archflow.json');
  const saved = JSON.parse(fs.readFileSync(await save.path(), 'utf8'));
  expect(saved).toMatchObject({ schemaVersion: 3, project: { name: '主機板' } });
  expect(saved.designs).toHaveLength(2);
  await expect(page.getByRole('status').first()).toContainText('已儲存');

  // export SVG
  await page.getByRole('button', { name: '匯出' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('輸出 2560 × 1440');
  const [svg] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載' }).click()]);
  expect(await lastDownload(page)).toBe('主機板 - 設計 1.svg');
  const source = fs.readFileSync(await svg.path(), 'utf8');
  expect(source).toMatch(/^<svg [^>]*width="2560" height="1440"/);
  expect(source).toContain('PMIC');
  expect(source).not.toContain('var(');

  // reopen the saved file from a new project
  await page.getByRole('button', { name: '新專案' }).click();
  await expect(page.getByRole('button', { name: '建立專案' })).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '開啟 JSON 專案' }).click()]);
  await chooser.setFiles(await save.path());
  await expect(page.getByRole('navigation', { name: '設計清單' }).getByRole('button')).toHaveCount(5); // 2 designs + 3 actions
  expect((await model(page)).blocks.map(x => x.title)).toEqual(['PMIC', '']);

  expect(errors).toEqual([]);
});

test('a V2 project file is refused with "legacy format" and nothing changes', async ({ page }) => {
  await page.goto('file://' + DIST);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '開啟 JSON 專案' }).click()]);
  await chooser.setFiles(V2_FILE);
  await expect(page.getByRole('alert')).toContainText('不支援舊版格式');
  await expect(page.getByRole('button', { name: '建立專案' })).toBeVisible();
});

test('the shell follows the interface language', async ({ page }) => {
  await page.goto('file://' + DIST);
  await page.getByLabel('介面語言').selectOption('en');
  await expect(page.getByRole('button', { name: 'Create project' })).toBeVisible();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Add block' })).toBeVisible();
  // reload: the choice is remembered (archflow:locale)
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create project' })).toBeVisible();
});

test('a project schedule from its template is drawn and can be panned', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '專案時程' }).check();
  await expect(page.getByRole('radio', { name: '範本：入門專案時程' })).toBeChecked();
  await page.getByRole('button', { name: '建立專案' }).click();
  await expect(page.getByRole('button', { name: /產品開發流程/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('svg.af-canvas .af-sched-card')).toHaveCount(5);
  await expect(page.locator('svg.af-canvas .af-sched-interval')).toHaveCount(4);
  await expect(page.locator('svg.af-canvas')).toContainText('專案時程');
  await expect(page.getByRole('button', { name: '新增方塊' })).toHaveCount(0);
  const before = await page.locator('svg.af-canvas .af-world').getAttribute('transform');
  const box = (await page.locator('svg.af-canvas').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 240);
  await page.mouse.up();
  expect(await page.locator('svg.af-canvas .af-world').getAttribute('transform')).not.toBe(before);
  expect(errors).toEqual([]);
});

test('schedule editing: select and rename a task, drag its card (one undo step), add a task, theme, export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '專案時程' }).check();
  await page.getByRole('button', { name: '建立專案' }).click();
  const panel = page.getByRole('complementary', { name: '屬性' });
  const tasks = () => page.evaluate(() => (window as unknown as { archflow: { store: { data(id: string): { tasks: { title: string; offset: { card: { x: number } } }[] }; activeDesignId: string } } }).archflow.store.data((window as unknown as { archflow: { store: { activeDesignId: string } } }).archflow.store.activeDesignId).tasks);

  // nothing selected: design-wide settings
  await expect(panel.getByRole('radio', { name: '含頭尾' })).toBeVisible();

  // click the first card, rename it in the panel
  const card = page.locator('svg.af-canvas [data-task]').first();
  await card.click();
  await expect(card).toHaveClass(/af-sched-card/);
  const title = panel.getByLabel('任務名稱');
  await title.fill('需求確認');
  await title.press('Enter');
  await expect(page.locator('svg.af-canvas .af-sched-title').first()).toHaveText('需求確認');

  // drag the card: offset changes, one undo step puts it back
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 50, { steps: 4 });
  await page.mouse.up();
  expect((await tasks())[0].offset.card.x).not.toBe(0);
  await page.getByRole('button', { name: '復原' }).click();
  expect((await tasks())[0].offset.card.x).toBe(0);
  expect((await tasks())[0].title).toBe('需求確認');

  // add a task after the selection; Delete removes it again
  const n = (await tasks()).length;
  await page.getByRole('button', { name: '新增任務' }).click();
  await expect(page.locator('svg.af-canvas .af-sched-card')).toHaveCount(n + 1);
  await page.locator('svg.af-canvas').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('svg.af-canvas .af-sched-card')).toHaveCount(n);

  // theme (nothing selected)
  await page.keyboard.press('Escape');
  await panel.getByRole('radio', { name: '系統青' }).check();
  await expect(page.locator('svg.af-canvas .af-schedule')).toHaveAttribute('data-sched-theme', 'mint');

  await page.getByRole('button', { name: '匯出' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('radio', { name: /電源檢視/ })).toHaveCount(0);
  const [svg] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: '下載' }).click()]);
  const source = fs.readFileSync(await svg.path(), 'utf8');
  expect(source).toContain('>需求確認<');
  expect(source.toLowerCase()).toContain('fill="#f6faf9"');
  expect(errors).toEqual([]);
});
