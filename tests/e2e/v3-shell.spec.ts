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
  await expect(page.locator('.af-design-trigger')).toContainText('設計 1');

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
  await page.locator('.af-design-trigger').click();
  await page.getByRole('menuitem', { name: '新增設計' }).click();
  await page.getByRole('dialog').getByLabel('設計名稱').fill('電源樹');
  await page.getByRole('dialog').getByRole('button', { name: '確定' }).click();
  await expect(page.locator('.af-design-trigger')).toContainText(/電源樹/);
  await page.locator('.af-design-trigger').click();
  await page.getByRole('menuitemradio', { name: /設計 1/ }).click();
  expect((await model(page)).blocks).toHaveLength(2);

  // save
  const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '儲存', exact: true }).click()]);
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
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await expect(page.getByRole('button', { name: '建立專案' })).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '開啟 JSON 專案' }).click()]);
  await chooser.setFiles(await save.path());
  await page.locator('.af-design-trigger').click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await page.keyboard.press('Escape');
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
  await expect(page.locator('.af-design-trigger')).toContainText(/產品開發流程/);
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

  // add a task after the selection: inserted before its old successor (3.43b), with dates;
  // Delete removes it again and the old successor is linked back
  const n = (await tasks()).length;
  const links = () => page.evaluate(() => { const a = (window as unknown as { archflow: { store: { data(id: string): { links: { from: string; to: string }[] }; activeDesignId: string } } }).archflow.store; return a.data(a.activeDesignId).links.map(l => `${l.from}>${l.to}`).sort(); });
  const before = await links();
  await card.click();
  await page.getByRole('button', { name: '接續任務' }).click();
  await expect(page.locator('svg.af-canvas .af-sched-card')).toHaveCount(n + 1);
  await expect(page.locator('.af-toast').last()).toContainText('後續任務接在它之後');
  await expect(panel.getByLabel('工期（含首尾）')).toBeVisible();
  await page.locator('svg.af-canvas').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('svg.af-canvas .af-sched-card')).toHaveCount(n);
  expect((await links()).length).toBe(before.length);

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

test('app bar and command bar (V2.10.1 look, 3.46a): one row each, design menu by keyboard, rename in place, duplicate, back from the start screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [1440, 1300, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('file://' + DIST);
    await page.getByRole('button', { name: '建立專案' }).click();
    expect(await page.locator('header.af-appbar').evaluate(e => e.getBoundingClientRect().height)).toBe(50);
    expect(await page.locator('.af-cmdbar').evaluate(e => e.getBoundingClientRect().height)).toBe(44);
    // the page itself never scrolls sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: path.resolve(HERE, '../../test-results/v3-appbar-1024.png') });
  await page.setViewportSize({ width: 1440, height: 900 });

  // the app bar: brand and version, save state, language, actions
  const bar = page.locator('header.af-appbar');
  await expect(bar.locator('.af-ver')).toHaveText(/^V\d+\.\d+\.\d+/);
  await expect(bar.getByRole('radiogroup', { name: '介面語言' }).getByRole('radio', { name: '中' })).toHaveAttribute('aria-checked', 'true');
  for (const name of ['新建', '開啟', '匯出', '儲存']) await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(bar.locator('.af-save-state')).toHaveAttribute('data-state', 'saved');

  // the design menu: ArrowDown opens on the first item, Escape returns focus, a click outside closes it
  const trigger = page.getByRole('button', { name: '切換或管理設計' });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: '切換或管理設計' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: '入門方塊圖' })).toBeFocused();
  await expect(menu.getByRole('menuitemradio', { name: '入門方塊圖' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.locator('svg.af-canvas').click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();

  // rename the project in place
  const name = page.getByRole('textbox', { name: '專案名稱' });
  await name.fill('電源板');
  await name.press('Enter');
  await expect(name).toHaveValue('電源板');
  await expect(bar.locator('.af-save-state')).toHaveAttribute('data-state', 'dirty');

  // duplicate the design from the design menu; the menu lists both and switches
  await trigger.click();
  await menu.getByRole('menuitem', { name: '複製設計' }).click();
  await expect(trigger).toContainText('副本');
  await trigger.click();
  await menu.getByRole('menuitemradio', { name: '入門方塊圖', exact: true }).click();
  await expect(trigger).toContainText('入門方塊圖');
  await expect(trigger.locator('.af-count')).toHaveText('2');

  // the command bar follows the design type: a schedule has its own commands, no block insert
  await page.locator('.af-design-trigger').click();
  await page.getByRole('menuitem', { name: '新增設計' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: '專案時程' }).check();
  await page.getByRole('dialog').getByRole('button', { name: '確定' }).click();
  const tools = page.getByRole('toolbar', { name: '工具列' });
  await expect(tools.getByRole('button', { name: '接續任務' })).toBeVisible();
  await expect(tools.getByRole('button', { name: '新增方塊' })).toHaveCount(0);

  // back from the start screen without losing the project
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確定' }).click();
  await page.getByRole('button', { name: '返回目前專案' }).click();
  await expect(name).toHaveValue('電源板');
  expect(errors).toEqual([]);
});

test('command palette and help (3.40): Ctrl+K, search, keyboard, go to a block; Ctrl+? shortcuts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  await expect(page.locator('svg.af-canvas [data-block]').first()).toBeVisible();

  // Ctrl+K opens the palette with focus in the search field
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: '指令面板' });
  const search = palette.getByRole('combobox', { name: '搜尋' });
  await expect(search).toBeFocused();
  await expect(palette.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');

  // type, move with the arrows, Enter runs the active option
  await search.fill('新增');
  await expect(palette.getByRole('option', { name: /新增方塊/ })).toBeVisible();
  await search.fill('新增方塊');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  const count = await page.evaluate(() => (window as unknown as { archflow: { data(): { blocks: unknown[] } } }).archflow.data().blocks.length);
  expect(count).toBe(5);

  // recent first; Escape closes and focus returns
  await page.getByRole('button', { name: /搜尋指令/ }).click();
  await expect(palette.locator('.af-palette-section').first()).toHaveText('最近使用');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(page.getByRole('button', { name: /搜尋指令/ })).toBeFocused();

  // nothing found
  await page.keyboard.press('Control+k');
  await search.fill('zzzz');
  await expect(palette).toContainText('找不到「zzzz」');

  // go to a block: selected in the properties panel
  await search.fill('微控制器');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: '屬性' }).getByRole('textbox').first()).toHaveValue('MCU'); // the block shown as 微控制器 (part number)

  // Ctrl+? opens help with the shortcuts list
  await page.locator('svg.af-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+Shift+?');
  const help = page.getByRole('dialog', { name: '說明與快捷鍵' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('table', { name: '編輯' })).toContainText('Ctrl+Z');
  await expect(help.getByRole('table', { name: '檢視與說明' })).toContainText('Ctrl+K');
  await page.screenshot({ path: path.resolve(HERE, '../../test-results/v3-help.png') });
  await help.getByRole('button', { name: '關閉' }).click();
  await expect(help).toBeHidden();
  expect(errors).toEqual([]);
});

test('status bar, notifications, empty hint and language switch without reload (3.41)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '空白設計' }).check();
  await page.getByRole('button', { name: '建立專案' }).click();

  // empty canvas: guidance; the status bar has the type, counts, saved state and zoom
  const bar = page.locator('.af-statusbar');
  await expect(page.locator('.af-empty-hint')).toContainText('按 B');
  await expect(bar).toContainText('方塊圖');
  await expect(bar).toContainText('0 個方塊 · 0 個接腳 · 0 條線路 · 0 個分支接點');
  await expect(bar).toContainText('已儲存');
  await page.getByRole('button', { name: '新增方塊' }).click();
  await expect(page.locator('.af-empty-hint')).toHaveCount(0);
  await expect(bar).toContainText('1 個方塊 · 2 個接腳'); // a new block has its default pins
  await expect(bar).toContainText('未儲存');

  // a notification can be closed, and closes by itself
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  const toast = page.locator('.af-toast').filter({ hasText: '已儲存' });
  await expect(toast).toHaveAttribute('role', 'status');
  await toast.getByRole('button', { name: '關閉通知' }).click();
  await expect(toast).toHaveCount(0);
  await page.getByRole('button', { name: '新增方塊' }).click();
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.locator('.af-toast')).toHaveCount(1);
  await expect(page.locator('.af-toast')).toHaveCount(0, { timeout: 6000 });

  // a power-sequence design in the vendor editor, then switch the language: no page reload,
  // project kept, shell and editor in English
  await page.locator('.af-design-trigger').click();
  await page.getByRole('menuitem', { name: '新增設計' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: '電源時序' }).check();
  await page.getByRole('dialog').getByRole('button', { name: '確定' }).click();
  await expect(page.frameLocator('iframe.af-embedded-frame').getByRole('button', { name: '新增電源軌' }).first()).toBeVisible();
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 1; });
  await page.getByRole('radiogroup', { name: '介面語言' }).getByRole('radio', { name: 'EN' }).click();
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe.af-embedded-frame').getByRole('button', { name: 'Add rail' }).first()).toBeVisible();
  await page.locator('.af-design-trigger').click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(bar).toContainText('Unsaved');
  // the editor still edits the project after the reload in English
  const rails = () => page.evaluate(() => ((window as unknown as { archflow: { data(): { rails: unknown[] } } }).archflow.data().rails.length));
  const n = await rails();
  await page.frameLocator('iframe.af-embedded-frame').getByRole('button', { name: 'Add rail' }).first().click();
  await expect.poll(rails).toBe(n + 1);
  // a tool opened now is in English too (focus is in the frame: open the palette from the app bar)
  await page.getByRole('button', { name: /Search commands/ }).click();
  await page.getByRole('combobox', { name: 'Search' }).fill('Pattern');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Pattern Generator' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('layout settings (3.41b): grid & align dialog, fonts dialog, arrange pins from the palette', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  const data = () => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { archflow: { data(): unknown } }).archflow.data())) as { grid: { size: number; show: boolean; snap: boolean }; theme?: { latinFont: string; title: number } });

  // align / grid: select all blocks, align them in a row (one undo step)
  await page.locator('svg.af-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: '格線與對齊' }).click();
  const dlg = page.getByRole('dialog', { name: '格線與對齊' });
  await expect(dlg).toContainText('以第一個選取的方塊為準');
  await dlg.getByRole('button', { name: '水平對齊' }).click();
  await expect(page.locator('.af-toast').last()).toContainText('已對齊選取方塊');
  // grid: spacing 20 (the diagram is put on the new grid), hide it, check it
  await dlg.getByRole('button', { name: '20', exact: true }).click();
  await expect.poll(async () => (await data()).grid.size).toBe(20);
  await dlg.getByRole('checkbox', { name: '顯示格線' }).uncheck();
  await expect.poll(async () => (await data()).grid.show).toBe(false);
  await dlg.getByRole('button', { name: '檢查格線' }).click();
  await expect(dlg.getByRole('list', { name: '檢查格線' }).getByRole('listitem')).toHaveCount(8);
  await expect(dlg.getByRole('list', { name: '檢查格線' })).toContainText('方塊位置與尺寸在格點上');
  await dlg.getByRole('button', { name: '關閉' }).click();
  // undo the grid show, the spacing, then the alignment
  await page.getByRole('button', { name: '復原' }).click();
  await expect.poll(async () => (await data()).grid.show).toBe(true);

  // fonts: validation in pt, apply, the blocks use the font, reset
  await page.getByRole('button', { name: '版面與字體' }).click();
  const fonts = page.getByRole('dialog', { name: '版面與字體' });
  await fonts.getByLabel('英文字體').selectOption('Arial');
  await fonts.getByLabel('IC 型號字級（pt）').fill('99');
  await expect(fonts.getByText('請輸入 9–36')).toBeVisible();
  await expect(fonts.getByRole('button', { name: '套用' })).toBeDisabled();
  await fonts.getByLabel('IC 型號字級（pt）').fill('24');
  await fonts.getByRole('button', { name: '套用' }).click();
  await expect(fonts).toBeHidden();
  expect((await data()).theme).toMatchObject({ latinFont: 'Arial', title: 32 });
  const family = await page.locator('svg.af-canvas .af-block text').first().evaluate(e => getComputedStyle(e).fontFamily);
  expect(family).toMatch(/^"?Arial/);
  await page.getByRole('button', { name: '版面與字體' }).click();
  await fonts.getByRole('button', { name: '回復預設' }).click();
  expect((await data()).theme).toBeUndefined();

  // arrange pins: one block selected
  await page.locator('svg.af-canvas [data-block]').first().click();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: '搜尋' }).fill('依連線排列接腳');
  await page.keyboard.press('Enter');
  await expect(page.locator('.af-toast').last()).toContainText('已依連線排列接腳');
  expect(errors).toEqual([]);
});

test('schedule overview (3.43h): span, status, milestones; a milestone in the list selects its task', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('radio', { name: '專案時程' }).check();
  await page.getByRole('radio', { name: '範本：產品開發時程' }).check();
  await page.getByRole('button', { name: '建立專案' }).click();
  const panel = page.getByRole('complementary', { name: '屬性' });
  const box = panel.getByRole('region', { name: '時程總覽' });
  await expect(box).toBeVisible();
  await expect(box.locator('.af-overview-span strong')).toHaveText(/\d+ 天/);
  await expect(box.getByRole('img')).toBeVisible();
  const ms = box.locator('.af-overview-item').filter({ hasText: '◆' }).first();
  const name = (await ms.locator('span').textContent())!.replace('◆ ', '');
  await ms.click();
  await expect(panel.getByLabel('任務名稱')).toHaveValue(name);
  expect(errors).toEqual([]);
});

test('project contents panel (V2.10.1 look, 3.46c): groups, search, click selects and centres, toggle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DIST);
  await page.getByRole('button', { name: '建立專案' }).click();
  const nav = page.getByRole('navigation', { name: '專案內容' });
  await expect(nav.getByRole('heading', { name: /功能方塊/ })).toContainText('4');
  await expect(nav.getByRole('heading', { name: /分支接點/ })).toContainText('0');
  await expect(nav.getByRole('button')).toHaveText(['感測器', '微控制器', '無線模組', '電源']);

  // a click selects the block (properties panel) and marks the entry
  await nav.getByRole('button', { name: '無線模組' }).click();
  await expect(nav.getByRole('button', { name: '無線模組' })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('IC 型號 / 料號')).toHaveValue('無線模組');

  // search filters; nothing found; Escape clears
  const search = nav.getByRole('searchbox', { name: '搜尋任務或元件' });
  await search.fill('感測');
  await expect(nav.getByRole('button')).toHaveText(['感測器']);
  await search.fill('zzzz');
  await expect(nav.getByRole('status')).toHaveText('找不到符合的項目');
  await search.press('Escape');
  await expect(nav.getByRole('button')).toHaveCount(4);

  // the power view calls the group "power blocks"
  await page.getByRole('button', { name: '電源檢視' }).click();
  await expect(nav.getByRole('heading', { name: /電源方塊/ })).toBeVisible();

  // the command bar toggle hides and shows the panel
  await page.getByRole('button', { name: '專案內容面板' }).click();
  await expect(nav).toHaveCount(0);
  await page.getByRole('button', { name: '專案內容面板' }).click();
  await expect(nav).toBeVisible();

  // a schedule lists its tasks with their dates
  await page.locator('.af-design-trigger').click();
  await page.getByRole('menuitem', { name: '新增設計' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: '專案時程' }).check();
  await page.getByRole('dialog').getByRole('button', { name: '確定' }).click();
  await expect(nav.getByRole('heading', { name: /任務/ })).toBeVisible();
  await expect(nav.getByRole('button').first()).toContainText(/開始 \d{4}\/\d{2}\/\d{2}/);
  await nav.getByRole('button').first().click();
  await expect(nav.getByRole('button').first()).toHaveAttribute('aria-current', 'true');
  expect(errors).toEqual([]);
});

