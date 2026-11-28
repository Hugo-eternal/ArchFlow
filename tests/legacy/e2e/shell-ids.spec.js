// module: shell — the V2 React shell drives the engine by clicking / reading hidden V1 elements by id
// (docs/v3-audit.md §4.1). If one of these ids is renamed or removed, a shell command silently
// stops working, so every id must exist in both locales. (v2-fix O6)
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { openIndex, engine, createProject } from './helpers.js';

// Present as soon as the engine loads (start screen), in both locales.
export const STATIC_IDS = [
  'view', 'add', 'saveProject', 'uiOpen', 'inspector', 'designSelect', 'workspaceManage', 'toggleInspector',
  'startScreen', 'startExamples', 'startCancel', 'scheduleBranch', 'scheduleAuto', 'reroute', 'projectName',
  'newProject', 'managedDesignType', 'managedDesignExample', 'fit', 'exportBtn', 'chineseFont', 'addText',
  'undo', 'stats', 'startLoad', 'renameDesign', 'remove', 'rcClearRoutes', 'projectSaveState', 'notice', 'load',
  'helpBtn', 'examplesBtn', 'englishFont', 'duplicateDesign', 'designBtn', 'deleteDesign', 'createProject',
  'addDesign',
];
// Built by the properties panel for the current selection; the shell checks for them before use.
export const NODE_IDS = ['afArrangeSelectedIO'];
export const EDGE_IDS = ['p13Name', 'm2Reroute'];

const missing = (page, ids) => engine(page).evaluate(ids => ids.filter(id => {
  const el = document.getElementById(id);
  return !(el instanceof HTMLElement) || typeof el.click !== 'function';
}), ids);

test('all 42 shell ids are listed', () => {
  expect(new Set([...STATIC_IDS, ...NODE_IDS, ...EDGE_IDS]).size).toBe(42);
});

for (const locale of ['zh-Hant', 'en']) {
  test(`static shell ids exist on the start screen (${locale})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(l => localStorage.setItem('archflow-language-v2', l), locale);
    await page.goto('file://' + path.resolve('index.html'));
    await expect.poll(() => engine(page)?.evaluate(() => document.documentElement.lang).catch(() => ''), { timeout: 20000 }).toBe(locale);
    await expect.poll(() => missing(page, STATIC_IDS), { timeout: 20000 }).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('selection-dependent shell ids appear for a block and a wire (zh-Hant, then en)', async ({ page }) => {
  const { app, errors } = await openIndex(page);
  await createProject(page, app, { name: 'E2E ids', start: '範本' });
  const check = async () => {
    await engine(page).evaluate(() => select({ type: 'node', id: model.nodes.find(n => n.ports.length).id }));
    await expect.poll(() => missing(page, NODE_IDS)).toEqual([]);
    await engine(page).evaluate(() => select({ type: 'edge', id: model.edges[0].id }));
    await expect.poll(() => missing(page, EDGE_IDS)).toEqual([]);
    expect(await missing(page, STATIC_IDS)).toEqual([]);
  };
  await check();
  await app.getByRole('radio', { name: 'EN' }).first().click();
  await expect(app.getByRole('button', { name: 'Export', exact: true })).toBeVisible({ timeout: 20000 });
  await check();
  expect(errors).toEqual([]);
});
