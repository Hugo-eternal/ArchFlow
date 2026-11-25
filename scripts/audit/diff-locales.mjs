#!/usr/bin/env node
// Read-only audit (V3 step 1.5): compare legacy/app.zh-Hant.html and legacy/app.en.html
// after masking every piece of human-readable text, so that only differences in
// code / markup structure remain.
//
// Usage: node scripts/audit/diff-locales.mjs [a.html] [b.html] [--context N]
//
// Masking: string literal contents ('…', "…", `…`), HTML text nodes, \uXXXX escapes
// and any non-ASCII run are replaced by placeholders. Lines are then diffed with an
// LCS over normalised lines; each differing hunk is printed with original line numbers.

import fs from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const a = files[0] || 'legacy/app.zh-Hant.html';
const b = files[1] || 'legacy/app.en.html';
const ctxArg = args.indexOf('--context');
const MAXSHOW = 220;

function mask(line) {
  return line
    .replace(/\\u[0-9a-fA-F]{4}/g, 'U')
    .replace(/'(?:\\.|[^'\\])*'/g, "'S'")
    .replace(/"(?:\\.|[^"\\])*"/g, '"S"')
    .replace(/`(?:\\.|[^`\\])*`/g, '`S`')
    .replace(/>[^<>]*</g, '>T<')
    .replace(/[^\x00-\x7f]+/g, 'N');
}

const A = fs.readFileSync(a, 'utf8').split('\n');
const B = fs.readFileSync(b, 'utf8').split('\n');
const MA = A.map(mask), MB = B.map(mask);

// Myers-style diff is overkill; files are ~10k lines and mostly aligned, so use
// a windowed greedy alignment: walk both, and on mismatch look ahead up to W lines
// for the nearest resync point.
const W = 60;
const hunks = [];
let i = 0, j = 0;
while (i < MA.length || j < MB.length) {
  if (i < MA.length && j < MB.length && MA[i] === MB[j]) { i++; j++; continue; }
  let best = null;
  for (let d = 1; d <= W && !best; d++) {
    for (let k = 0; k <= d; k++) {
      const ii = i + k, jj = j + (d - k);
      if (ii < MA.length && jj < MB.length && MA[ii] === MB[jj] && MA[ii].trim() !== '') { best = [ii, jj]; break; }
    }
  }
  if (!best) best = [Math.min(i + 1, MA.length), Math.min(j + 1, MB.length)];
  // 1-based inclusive ranges; empty when end < start
  hunks.push({ a: [i + 1, best[0]], b: [j + 1, best[1]] });
  [i, j] = best;
}

// A one-line hunk on both sides where only text inside masked regions changed
// cannot occur (masked lines would be equal), so every hunk is structural.
const show = (L, [s, e]) => L.slice(s - 1, e).map((l, k) => `    ${s + k}: ${l.length > MAXSHOW ? l.slice(0, MAXSHOW) + ` … (${l.length} chars)` : l}`).join('\n');
console.log(`# Non-translation differences: ${a} vs ${b}\n`);
console.log(`${A.length} vs ${B.length} lines; ${hunks.length} structural hunk(s).\n`);
const range = ([s, e]) => (e < s ? `(none, before ${s})` : s === e ? `${s}` : `${s}–${e}`);
for (const h of hunks) {
  console.log(`## ${a}:${range(h.a)}  ↔  ${b}:${range(h.b)}`);
  if (h.a[1] >= h.a[0]) console.log('  - ' + a + '\n' + show(A, h.a));
  if (h.b[1] >= h.b[0]) console.log('  + ' + b + '\n' + show(B, h.b));
  console.log();
}
