// Test helper: open the V2.10.1 app (legacy/app.<locale>.html) in headless Chromium and
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
import fs from 'node:fs';
import path from 'node:path';

// Same font injection as index.html's afWithFont(): the embedded Source Han Sans TC
// (AF_FONT_CSS on index.html line 3) is added before </head>, so text metrics — and
// therefore block sizes, routes and exports — match the shipped file on any machine.
let fontCss = null;
function withFont(html) {
  if (fontCss === null) {
    const line = fs.readFileSync('index.html', 'utf8').split('\n').find(l => l.startsWith('const AF_FONT_CSS='));
    fontCss = JSON.parse(line.slice('const AF_FONT_CSS='.length, line.indexOf('";function afWithFont') + 1));
  }
  const tag = '<style id="af2-fonts">' + fontCss + '</style>';
  const i = html.indexOf('</head>');
  return i < 0 ? tag + html : html.slice(0, i) + tag + html.slice(i);
}

let browser = null;
let users = 0;

/** `now`: fix the page clock (Date) for output that prints today's date (sequence export). */
export async function openApp({ locale = 'zh-Hant', viewport = { width: 1500, height: 950 }, now = null } = {}) {
  if (!browser) browser = await chromium.launch();
  users++;
  const page = await browser.newPage({ viewport });
  if (now) await page.clock.setFixedTime(now);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Load the font-injected document as the wrapper's iframe srcdoc does. Start from a blank
  // file:// page first so the document has a file:// origin (localStorage works, as in the
  // shipped iframe); about:blank would deny localStorage to the embedded editors.
  await page.goto('file://' + path.resolve('tests/helpers/blank.html'));
  await page.setContent(withFont(fs.readFileSync(`legacy/app.${locale}.html`, 'utf8')), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
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
