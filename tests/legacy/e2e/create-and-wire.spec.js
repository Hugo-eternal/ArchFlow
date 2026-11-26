// module: shell — create a project, add blocks and draw a wire through the V2 shell UI.
import { test, expect } from '@playwright/test';
import { openIndex, engine, createProject, centre } from './helpers.js';

test('create a blank function project, add two blocks and connect them', async ({ page }) => {
  const { app, errors } = await openIndex(page);
  await createProject(page, app, { name: 'E2E 連線' });
  const model = () => engine(page).evaluate(() => ({ name: projectMeta.name, nodes: model.nodes.map(n => ({ id: n.id, ports: n.ports.map(p => ({ id: p.id, side: p.side })) })), edges: model.edges.map(e => [e.a, e.b]) }));

  expect((await model()).name).toBe('E2E 連線');
  expect((await model()).nodes).toHaveLength(0);

  const add = app.getByRole('button', { name: /新增方塊/ }).first();
  await add.click();
  await add.click();
  await expect.poll(async () => (await model()).nodes.length).toBe(2);

  const { nodes } = await model();
  const out = nodes[0].ports.find(p => p.side === 'r');
  const inp = nodes[1].ports.find(p => p.side === 'l');
  const a = await centre(page, `[data-port="${out.id}"]`);
  const b = await centre(page, `[data-port="${inp.id}"]`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, a.y + 30, { steps: 8 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await model()).edges).toEqual([[{ node: nodes[0].id, port: out.id }, { node: nodes[1].id, port: inp.id }]]);
  // the wire is drawn on the canvas and the status bar counts it
  await expect(app.locator('#edges .wire')).not.toHaveCount(0);
  expect(await engine(page).evaluate(() => (routes.get(model.edges[0].id)?.ps || []).length)).toBeGreaterThan(1);
  await expect(app.getByRole('status').filter({ hasText: '1 條線路' }).first()).toBeVisible();

  // undo removes the wire, redo brings it back
  await app.getByRole('button', { name: '復原' }).click();
  await expect.poll(async () => (await model()).edges.length).toBe(0);
  await app.getByRole('button', { name: '重做' }).click();
  await expect.poll(async () => (await model()).edges.length).toBe(1);

  expect(errors).toEqual([]);
});
