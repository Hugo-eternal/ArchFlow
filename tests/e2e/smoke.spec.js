// module: shell — smoke test: the packed app opens and shows the start screen without page errors.
import { test, expect } from '@playwright/test';
import path from 'node:path';

test('index.html opens the start screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('index.html'));
  const app = page.frameLocator('#app');
  // V2 shell start screen (the V1 #startScreen form stays in the DOM but hidden)
  await expect(app.getByRole('heading', { level: 1, name: '建立新專案' })).toBeVisible({ timeout: 15000 });
  await expect(app.getByRole('button', { name: 'RSI BOM Converter' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
