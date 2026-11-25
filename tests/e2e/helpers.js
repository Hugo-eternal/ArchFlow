// Shared E2E helpers: everything goes through index.html and the V2 shell UI, the way a
// user works. `engine(page)` gives the app iframe for read-only checks of model state.
import path from 'node:path';
import { expect } from '@playwright/test';

export async function openIndex(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('index.html'));
  const app = page.frameLocator('#app');
  await expect(app.getByRole('heading', { level: 1, name: '建立新專案' })).toBeVisible({ timeout: 20000 });
  return { app, errors };
}

export const engine = page => page.frame({ name: 'app' }); // Playwright names a frame by its element's name/id

/** Start screen → create a project. type: card label; template: radio label or '空白設計'. */
export async function createProject(page, app, { name = 'E2E 專案', type = '功能方塊設計', start = '空白設計' } = {}) {
  await app.getByRole('textbox', { name: '專案名稱' }).last().fill(name);
  await app.getByRole('radio', { name: new RegExp('^' + type) }).click();
  if (start) await app.getByRole('radio', { name: start }).first().click();
  await app.getByRole('button', { name: '建立專案' }).click();
  await page.waitForTimeout(800);
}

/** Centre of an element inside the app iframe, in page coordinates (boundingBox is page-relative). */
export async function centre(page, selector) {
  const box = await page.frameLocator('#app').locator(selector).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
