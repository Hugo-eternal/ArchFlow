// module: designs:function — v2-fix F2: a selected area frame shows in the properties panel and in
// the project contents list (V2.10.1 showed "未選取" and listed no frames).
import { test, expect } from '@playwright/test';
import { openIndex, engine, createProject } from './helpers.js';

test('frame: contents list, properties panel header and fields', async ({ page }) => {
  const { app, errors } = await openIndex(page);
  await createProject(page, app, { name: 'E2E 區域框', start: '範本' });
  const f = engine(page);
  await f.evaluate(() => {
    const n = model.nodes[0];
    model.afFrames = [{ id: 'frT', title: '電源區', x: n.x - 20, y: n.y - 40, w: n.w + 40, h: n.h + 60, style: 'dash', color: 'teal' }];
    select(null); render(); commit();
  });

  // project contents: a 區域框 group with the frame; clicking it selects the frame
  const nav = app.locator('.navigator');
  await expect(nav.locator('#af40NavSection')).toContainText('區域框');
  await expect(nav.locator('#af40NavCount')).toHaveText('1');
  await nav.getByRole('button', { name: '電源區' }).click();
  expect(await f.evaluate(() => window.afFrames.selected())).toBe('frT');
  await expect(nav.getByRole('button', { name: '電源區' })).toHaveClass(/active/);

  // panel header: kind + name instead of 未選取
  const pseudo = which => f.evaluate(w => getComputedStyle(document.querySelector('.af2-insp-title'), w).content, which);
  expect(await pseudo('::before')).toBe('"區域框"');
  expect(await pseudo('::after')).toBe('"電源區"');
  await expect(app.locator('.af2-insp-kind')).toBeHidden();

  // panel fields
  const panel = app.locator('#af40-inspector');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('框內 1 個方塊');
  const steps = await f.evaluate(() => past.length);
  await panel.getByRole('textbox', { name: '區域框名稱' }).fill('輸入級');
  await panel.getByRole('textbox', { name: '區域框名稱' }).press('Enter');
  await expect.poll(() => f.evaluate(() => model.afFrames[0].title)).toBe('輸入級');
  expect(await f.evaluate(() => past.length)).toBe(steps + 1);
  await expect(app.locator('.af40-tab').first()).toContainText('輸入級');
  expect(await pseudo('::after')).toBe('"輸入級"');

  await panel.getByRole('button', { name: '實線' }).click();
  await expect.poll(() => f.evaluate(() => model.afFrames[0].style)).toBe('solid');
  await panel.getByRole('button', { name: '琥珀' }).click();
  await expect.poll(() => f.evaluate(() => model.afFrames[0].color)).toBe('amber');
  await expect(panel.getByRole('button', { name: '琥珀' })).toHaveAttribute('aria-pressed', 'true');

  // selecting a block puts the normal panel back
  await f.evaluate(() => select({ type: 'node', id: model.nodes[0].id }));
  await expect(panel).toHaveCount(0);
  await expect(app.locator('.af2-insp-kind')).toHaveText('方塊');

  // delete from the panel
  await nav.getByRole('button', { name: '輸入級' }).click();
  await app.locator('#af40-inspector').getByRole('button', { name: '刪除區域框' }).click();
  expect(await f.evaluate(() => (model.afFrames || []).length)).toBe(0);
  await expect(nav.locator('#af40NavSection')).toBeHidden();
  await expect(app.locator('.af2-insp-kind')).toHaveText('未選取');
  expect(errors).toEqual([]);
});
