#!/usr/bin/env node
// i18n check (V3 step 3.3, plan §3.1 R9):
//  - i18n/zh-Hant.json and i18n/en.json have exactly the same keys, no empty values, and the
//    same {placeholders} for every key;
//  - no CJK characters in src/ (code, markup, styles) — wording belongs in i18n/*.json.
//    Third-party bundles live in vendor/, outside src/, and are not checked.
import fs from 'node:fs';
import path from 'node:path';

const problems = [];
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const zh = load('i18n/zh-Hant.json'), en = load('i18n/en.json');
const ph = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const k of Object.keys(zh)) if (!(k in en)) problems.push(`en.json is missing "${k}"`);
for (const k of Object.keys(en)) if (!(k in zh)) problems.push(`zh-Hant.json is missing "${k}"`);
for (const [name, cat] of [['zh-Hant', zh], ['en', en]])
  for (const [k, v] of Object.entries(cat)) {
    if (typeof v !== 'string' || !v.trim()) problems.push(`${name}.json "${k}" is empty`);
    if (!/^[a-z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(k)) problems.push(`${name}.json key "${k}" must look like "area.item"`);
  }
for (const k of Object.keys(zh)) if (k in en && ph(zh[k]) !== ph(en[k])) problems.push(`placeholders differ for "${k}": {${ph(zh[k])}} vs {${ph(en[k])}}`);

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;
// language names shown in their own script are the one allowed exception
const ALLOWED = ['繁體中文'];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const f of walk('src').filter(f => /\.(ts|tsx|html|css|json)$/.test(f))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const rest = ALLOWED.reduce((s, a) => s.split(a).join(''), line);
    if (CJK.test(rest)) problems.push(`${f}:${i + 1}: CJK text in source — move it to i18n/*.json`);
  });
}

console.log(`i18n: ${Object.keys(zh).length} keys`);
if (problems.length) { console.error(problems.map(p => '✗ ' + p).join('\n')); process.exit(1); }
console.log('✓ catalogs aligned, no CJK text in src/');
