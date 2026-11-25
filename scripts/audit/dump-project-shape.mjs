#!/usr/bin/env node
// Read-only audit (V3 steps 1.3 / 1.4): open the app in headless Chromium, create
// one example project per design type, call the engine's projectData(), and print
// every field (with its JS type) found in the saved JSON.
//
// Usage: node scripts/audit/dump-project-shape.mjs [src/app.zh-Hant.html]
// Needs Playwright with a Chromium build (preinstalled in the cloud sessions).

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const file = path.resolve(process.argv[2] || 'src/app.zh-Hant.html');
const TYPES = ['function', 'power', 'schedule', 'sequence', 'flowchart'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + file);
await page.waitForTimeout(1500);

const result = await page.evaluate(async types => {
  // Merge the shape of many values into one: {key: 'type|type'} for objects, [shape] for arrays.
  const kind = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  const merge = (acc, v, depth = 0) => {
    if (Array.isArray(v)) {
      acc = acc && acc.items ? acc : { items: null };
      for (const x of v) acc.items = merge(acc.items, x, depth + 1);
      return acc;
    }
    if (v && typeof v === 'object' && depth < 6) {
      acc = acc && acc.fields ? acc : { fields: {} };
      for (const [rawKey, x] of Object.entries(v)) {
        // maps keyed by generated ids (uid() = 'x' + 9 chars) collapse to one entry
        const k = /^x[a-z0-9]{6,12}$/.test(rawKey) ? '<id>' : rawKey;
        const prev = acc.fields[k] || { types: [] };
        if (!prev.types.includes(kind(x))) prev.types.push(kind(x));
        const sub = merge(prev.sub, x, depth + 1);
        if (sub && typeof sub === 'object') prev.sub = sub;
        acc.fields[k] = prev;
      }
      return acc;
    }
    return acc;
  };
  const out = { runs: [], top: null, perType: {} };
  for (const type of types) {
    try {
      createWorkspaceProject(type, 'Audit ' + type, true);
      await new Promise(r => setTimeout(r, 800));
      const data = projectData();
      out.top = merge(out.top, data);
      out.perType[type] = merge(null, data.designs?.[0]);
      out.runs.push(`${type}: ok, applicationVersion=${data.applicationVersion}, version=${data.version}`);
    } catch (e) {
      out.runs.push(`${type}: ${e.message}`);
    }
  }
  return out;
}, TYPES);
await browser.close();

const print = (node, indent = '') => {
  if (!node) return;
  if (node.items) { console.log(indent + '[]'); print(node.items, indent + '  '); return; }
  for (const [k, v] of Object.entries(node.fields || {})) {
    console.log(`${indent}${k}: ${v.types.join(' | ')}`);
    if (v.sub) print(v.sub.items ? v.sub.items : v.sub, indent + '  ');
  }
};

console.log(`# Saved-project shape (${path.relative(process.cwd(), file)})\n`);
for (const r of result.runs) console.log('- ' + r);
console.log('\n## Top level (merged over all types; designs[] omitted)');
print({ fields: Object.fromEntries(Object.entries(result.top?.fields || {}).filter(([k]) => k !== 'designs')) });
for (const [type, shape] of Object.entries(result.perType)) {
  console.log(`\n## designs[] entry — ${type}`);
  print(shape);
}
if (errors.length) console.log('\nPage errors:\n' + errors.map(e => '- ' + e).join('\n'));
