#!/usr/bin/env node
// Build-artifact check (V3 step 3.2) for dist/ArchFlow.html:
//  1. FAIL if anything would make a network request: <script src>, <link href>, <img|iframe|
//     source|video|audio src>, CSS url()/@import, srcset, or fetch / XMLHttpRequest /
//     WebSocket / EventSource / sendBeacon / import() with an http(s) or protocol-relative URL.
//  2. List every other http(s) URL as information (e.g. XML namespaces, links in text).
//  3. Report the size and WARN when it exceeds the V2.10.1 release (index.html).
// Usage: node scripts/check-dist.mjs [dist/ArchFlow.html] [--max-bytes N]
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--')) || 'dist/ArchFlow.html';
const maxArg = args.indexOf('--max-bytes');
if (!fs.existsSync(file)) { console.error(`✗ ${file} not found — run npm run build first`); process.exit(1); }
const html = fs.readFileSync(file, 'utf8');
const bytes = Buffer.byteLength(html);
const limit = maxArg >= 0 ? Number(args[maxArg + 1]) : fs.existsSync('index.html') ? fs.statSync('index.html').size : Infinity;

const REMOTE = String.raw`(?:https?:)?//[^\s"'()<>]+`;
const rules = [
  ['element src/href', new RegExp(String.raw`<(?:script|img|iframe|source|video|audio|embed|track|input)\b[^>]*\ssrc\s*=\s*["']?(${REMOTE})`, 'gi')],
  ['<link href>', new RegExp(String.raw`<link\b[^>]*\shref\s*=\s*["']?(${REMOTE})`, 'gi')],
  ['srcset', new RegExp(String.raw`srcset\s*=\s*["'][^"']*?(${REMOTE})`, 'gi')],
  ['CSS url()', new RegExp(String.raw`url\(\s*["']?(${REMOTE})`, 'gi')],
  ['CSS @import', new RegExp(String.raw`@import\s+(?:url\()?\s*["']?(${REMOTE})`, 'gi')],
  ['script request', new RegExp(String.raw`\b(?:fetch|XMLHttpRequest\(\)\.open\([^,]*,|new\s+WebSocket|new\s+EventSource|sendBeacon|import)\s*\(\s*["'\`](${REMOTE})`, 'gi')],
];
const failures = [], failing = new Set();
for (const [kind, re] of rules) for (const m of html.matchAll(re)) { failures.push(`${kind}: ${m[1].slice(0, 120)}`); failing.add(m[1]); }

// Informational: every other absolute URL (namespaces such as http://www.w3.org/2000/svg are expected)
const NAMESPACES = /^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml|XML\/1998\/namespace|1998\/Math\/MathML|2000\/xmlns\/)$/;
const others = new Map();
for (const m of html.matchAll(/https?:\/\/[^\s"'()<>\\`]+/g)) {
  const url = m[0].replace(/[.,;]+$/, '');
  if (NAMESPACES.test(url) || failing.has(url)) continue;
  others.set(url, (others.get(url) || 0) + 1);
}

const mb = n => (n / 1048576).toFixed(2) + ' MB';
console.log(`${file}: ${mb(bytes)} (${bytes} bytes); limit ${Number.isFinite(limit) ? mb(limit) + ' (V2.10.1 index.html)' : 'none'}`);
if (others.size) {
  console.log(`ℹ ${others.size} other URL(s) appear as text (not requests):`);
  for (const [u, n] of [...others].slice(0, 30)) console.log(`   ${n}× ${u}`);
}
let exit = 0;
if (failures.length) {
  console.error(`✗ ${failures.length} external request(s) found — the file must work offline:`);
  for (const f of failures) console.error('   ' + f);
  exit = 1;
} else console.log('✓ no external requests');
if (bytes > limit) console.warn(`⚠ larger than V2.10.1 by ${mb(bytes - limit)}`);
process.exit(exit);
