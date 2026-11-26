// module: designs:sequence, designs:flowchart, tools:bom, tools:edid, tools:hex, tools:pattern
// — vendor/ holds exactly what V2.10.1 injects into its editor / tool iframes (step 3.5).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { openApp } from '../../helpers/load-app.js';

const read = f => fs.readFileSync(`vendor/${f}`, 'utf8');
const srcdocOf = (app, selector) => app.eval(sel => document.querySelector(sel)?.srcdoc ?? null, selector);

describe('vendor files match the running V2.10.1 app', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const [type, dir, frame] of [['sequence', 'sequence-editor', '#af2-seq-frame'], ['flowchart', 'flowchart-editor', '#af2-flow-frame']]) {
    it(`${type} editor iframe = vendor/${dir}/style.css + bundle.js`, async () => {
      await app.createProject(type);
      await app.page.waitForTimeout(800);
      const doc = await srcdocOf(app, frame);
      expect(doc).toContain(`<style>${read(`${dir}/style.css`)}</style>`);
      expect(doc).toContain(`<div id="root"></div><script>${read(`${dir}/bundle.js`)}</script></body></html>`);
    });
  }

});

describe('vendor tool pages match the running V2.10.1 app', () => {
  let app;
  // tool buttons live on the start screen, so no project is created here
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const [label, file] of [['RSI BOM Converter', 'rsi-bom'], ['EDID Generator', 'tools/edid.html'], ['Hex/Bin Editor & Compare', 'tools/hex.html'], ['Pattern Generator', 'tools/pattern.html']]) {
    it(`${label} iframe = vendor/${file}`, async () => {
      await app.page.getByRole('button', { name: label }).first().click({ timeout: 10000 });
      await app.page.waitForTimeout(800);
      const doc = await srcdocOf(app, `iframe.af2-tool-frame[title="${label}"]`);
      if (file === 'rsi-bom') {
        expect(doc).toContain(`<style>${read('rsi-bom/style.css')}</style>`);
        expect(doc).toContain(`<script>${read('rsi-bom/bundle.js')}</script>`);
      } else {
        expect(doc).toBe(read(file));
      }
      await app.eval(() => ['afRsiHost', 'afEdidHost', 'afHexHost', 'afPgHost'].forEach(h => window[h]?.close()));
    });
  }
});
