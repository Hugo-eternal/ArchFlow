// module: shell — add a second design, switch between designs, save the project and reopen it.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openIndex, engine, createProject } from './helpers.js';

const state = page => engine(page).evaluate(() => ({
  name: projectMeta.name,
  active: currentDesign()?.name,
  designs: designs.map(d => ({ name: d.name, type: d.type, nodes: (d.id === activeDesignId ? model : d.state.model).nodes.length })),
}));

test('add a power design, switch designs, save and reopen the project', async ({ page }, info) => {
  const { app, errors } = await openIndex(page);
  await createProject(page, app, { name: 'E2E 多設計', start: '範本' });
  expect((await state(page)).designs).toEqual([{ name: '入門方塊圖', type: 'function', nodes: 4 }]);

  // add a power design with its example through the design switcher
  await app.getByRole('button', { name: '入門方塊圖' }).click();
  await app.getByText('新增設計…').click();
  await app.locator('#managedDesignName').fill('電源 A');
  await app.locator('#managedDesignType').selectOption({ label: '電源架構設計' });
  await app.locator('#managedDesignExample').check();
  await app.getByRole('button', { name: '儲存設計' }).click();
  await expect.poll(async () => (await state(page)).active).toBe('電源 A');
  const two = (await state(page)).designs;
  expect(two.map(d => [d.name, d.type])).toEqual([['入門方塊圖', 'function'], ['電源 A', 'power']]);
  expect(two[1].nodes).toBeGreaterThan(0);

  // switch back: the first design keeps its content
  await app.getByRole('button', { name: '電源 A' }).click();
  await app.getByText('入門方塊圖', { exact: true }).last().click();
  await expect.poll(async () => (await state(page)).active).toBe('入門方塊圖');
  expect((await state(page)).designs).toEqual(two);

  // save through the shell's 儲存 button
  const [download] = await Promise.all([page.waitForEvent('download'), app.getByRole('button', { name: '儲存', exact: true }).click()]);
  const file = info.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.designs.map(d => d.name)).toEqual(['入門方塊圖', '電源 A']);
  await expect(app.getByRole('button', { name: '未儲存的變更' })).toHaveCount(0);

  // reopen in a fresh page through the start screen's 開啟 JSON 專案 button
  const again = await openIndex(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), again.app.getByRole('button', { name: '開啟 JSON 專案' }).click()]);
  await chooser.setFiles(file);
  await expect.poll(async () => (await state(page)).name).toBe('E2E 多設計');
  const reopened = await state(page);
  expect(reopened.designs).toEqual(two);
  expect(reopened.active).toBe('入門方塊圖');

  expect([...errors, ...again.errors]).toEqual([]);
});
