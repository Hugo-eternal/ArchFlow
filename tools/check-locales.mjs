#!/usr/bin/env node
// v2-fix O1: legacy/app.zh-Hant.html and legacy/app.en.html must have the same code structure.
// Text (string literals, HTML text nodes, \uXXXX escapes, non-ASCII runs) is masked, then the two
// files are diffed line by line. Every remaining difference must match one of the ALLOWED rules
// (the 7 known differences in docs/v3-audit.md §3.2); anything else fails, so a fix made in only
// one locale is caught before commit.
//
// Usage: node tools/check-locales.mjs [zh.html] [en.html]
// Exit code 0 = same structure (apart from allowed differences), 1 = unexpected difference.
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const [aPath = root + 'legacy/app.zh-Hant.html', bPath = root + 'legacy/app.en.html'] = process.argv.slice(2);

export function mask(line) {
  return line
    .replace(/\\u[0-9a-fA-F]{4}/g, 'U')
    .replace(/'(?:\\.|[^'\\])*'/g, "'S'")
    .replace(/"(?:\\.|[^"\\])*"/g, '"S"')
    .replace(/`(?:\\.|[^`\\])*`/g, '`S`')
    .replace(/>[^<>]*</g, '>T<')
    .replace(/[^\x00-\x7f]+/g, 'N');
}

/** Line hunks that differ after masking. Windowed greedy alignment (files are ~10k lines, mostly aligned). */
export function structuralHunks(A, B, W = 60) {
  const MA = A.map(mask), MB = B.map(mask);
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
    hunks.push({ a: [i, best[0]], b: [j, best[1]], A: A.slice(i, best[0]), B: B.slice(j, best[1]) });
    [i, j] = best;
  }
  return hunks;
}

// Known, intentional differences (docs/v3-audit.md §3.2). Remove a rule when its fix lands
// (B9 unifies the load-failure message; D27 removes the en-only text tidy).
export const ALLOWED = [
  { id: 'load-failure-message (audit §3.2 #1, fixed by B9)',
    test: h => h.A.length === 1 && h.B.length === 1 && /alert\(/.test(h.A[0]) && /alert\(/.test(h.B[0]) && /8 MB/.test(h.A[0] + h.B[0]) },
  { id: 'translated comment (audit §3.2 #2)',
    test: h => h.A.length === h.B.length && h.A.length > 0 && [...h.A, ...h.B].every(l => /^\s*\/\//.test(l)) },
  { id: 'en-only v147-en-text-tidy script (audit §3.2 #3, removed by D27)',
    test: h => h.B.some(l => l.includes('<script id="v147-en-text-tidy">')) && h.A.length <= 1 &&
      (h.A.length === 0 || h.B[h.B.length - 1].endsWith(h.A[0])) },
  { id: 'hard-coded EN flag (audit §3.2 #4–#7)',
    test: h => h.A.length === h.B.length && h.A.length > 0 && h.A.every((l, k) => l.replace(/\bEN=false\b/g, 'EN=true') === h.B[k]) },
];

function main() {
  const A = fs.readFileSync(aPath, 'utf8').split('\n');
  const B = fs.readFileSync(bPath, 'utf8').split('\n');
  const hunks = structuralHunks(A, B);
  const bad = [];
  const used = new Map();
  for (const h of hunks) {
    const rule = ALLOWED.find(r => r.test(h));
    if (rule) used.set(rule.id, (used.get(rule.id) || 0) + 1);
    else bad.push(h);
  }
  const range = ([s, e]) => (e <= s ? `(none, before ${s + 1})` : e - s === 1 ? `${s + 1}` : `${s + 1}–${e}`);
  const cut = l => (l.length > 200 ? l.slice(0, 200) + ` … (${l.length} chars)` : l);
  console.log(`check-locales: ${A.length} vs ${B.length} lines, ${hunks.length} structural difference(s), ${hunks.length - bad.length} allowed`);
  for (const [id, n] of used) console.log(`  allowed ×${n}: ${id}`);
  if (!bad.length) return 0;
  console.error(`\n${bad.length} unexpected difference(s) — the two locales must get the same code change:`);
  for (const h of bad) {
    console.error(`\n## zh-Hant:${range(h.a)}  ↔  en:${range(h.b)}`);
    h.A.forEach((l, k) => console.error(`  - ${h.a[0] + k + 1}: ${cut(l)}`));
    h.B.forEach((l, k) => console.error(`  + ${h.b[0] + k + 1}: ${cut(l)}`));
  }
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
