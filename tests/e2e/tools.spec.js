// module: tools:bom, tools:edid, tools:hex, tools:pattern — each built-in tool opens from the
// start screen in its own iframe, shows its UI, and closes through its host object
// (window.af*Host.close(), the vendor interface V3 must keep — audit §5.2).
import { test, expect } from '@playwright/test';
import { openIndex, engine } from './helpers.js';

const TOOLS = [
  { name: 'RSI BOM Converter', host: 'afRsiHost', expect: '把 BOM 轉成 RSI 格式' },
  { name: 'EDID Generator', host: 'afEdidHost', expect: '產生 EDID 基本區塊' },
  { name: 'Hex/Bin Editor & Compare', host: 'afHexHost', expect: '支援的格式' },
  { name: 'Pattern Generator', host: 'afPgHost', expect: '尺寸' },
];
const button = (app, name) => app.getByRole('button', { name: new RegExp('^' + name.replace(/[/&.]/g, m => '\\' + m)) }).first();

for (const tool of TOOLS) {
  test(`${tool.name} opens, shows its UI and closes`, async ({ page }) => {
    const { app, errors } = await openIndex(page);
    await button(app, tool.name).click();
    const frame = app.locator(`iframe.af2-tool-frame[title="${tool.name}"]`);
    await expect(frame).toBeVisible();
    await expect(app.frameLocator(`iframe.af2-tool-frame[title="${tool.name}"]`).locator('body')).toContainText(tool.expect, { timeout: 15000 });

    await engine(page).evaluate(h => window[h].close(), tool.host);
    await expect(frame).toBeHidden(); // the iframe is kept in the DOM, hidden
    await expect(app.getByRole('heading', { level: 1, name: '建立新專案' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Hex/Bin editor loads a binary file and shows its bytes', async ({ page }) => {
  const { app, errors } = await openIndex(page);
  await button(app, 'Hex/Bin Editor & Compare').click();
  const hex = app.frameLocator('iframe.af2-tool-frame[title="Hex/Bin Editor & Compare"]');
  await expect(hex.locator('body')).toContainText('支援的格式', { timeout: 15000 });
  await hex.locator('input[type=file]').first().setInputFiles({ name: 'sample.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02, 0x7f]) });
  await expect(hex.locator('body')).toContainText(/DE\s*AD\s*BE\s*EF/i, { timeout: 10000 });
  expect(errors).toEqual([]);
});
