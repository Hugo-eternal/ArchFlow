// Test helper: open the V2.10.1 app (src/app.<locale>.html) in headless Chromium and
// call engine globals (findPath, validateDiagram, projectData, …) from Vitest.
//
// Why not jsdom: loading the engine in jsdom never settles (step 2.2 probe timed out
// after 90 s) — the app relies on layout (getBoundingClientRect, getComputedStyle,
// ResizeObserver) and timer-driven patches. A real browser is the reliable baseline.
//
// Usage:
//   const app = await openApp();               // or openApp({ locale: 'en' })
//   const path = await app.eval((a, b) => findPath(a, b, []), {x:0,y:0}, {x:100,y:50});
//   await app.close();
import { chromium } from '@playwright/test';
import path from 'node:path';

let browser = null;
let users = 0;

export async function openApp({ locale = 'zh-Hant', viewport = { width: 1500, height: 950 } } = {}) {
  if (!browser) browser = await chromium.launch();
  users++;
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(`src/app.${locale}.html`));
  await page.waitForFunction(() => typeof window.findPath === 'function' && typeof window.projectData === 'function');
  // let the post-load patches (setTimeout / rAF based) settle
  await page.waitForTimeout(500);

  return {
    page,
    errors,
    /** Run fn inside the app window; extra args must be JSON-serialisable. */
    eval(fn, ...args) {
      return page.evaluate(({ src, args }) => (0, eval)('(' + src + ')')(...args), { src: fn.toString(), args });
    },
    /** Create a project the way the start screen does, then wait for patches to settle. */
    async createProject(type = 'function', { name = 'Test', examples = true } = {}) {
      await page.evaluate(([t, n, e]) => createWorkspaceProject(t, n, e), [type, name, examples]);
      await page.waitForTimeout(600);
    },
    async close() {
      await page.close();
      if (--users === 0) { await browser.close(); browser = null; }
    },
  };
}
