#!/usr/bin/env node
// Extract the bundles embedded in the V2.10.1 shell (legacy/app.zh-Hant.html,
// <script id="af20-shell">) into vendor/, byte for byte (V3 step 3.5, audit §5.3).
//
// The shell keeps each editor / tool as a JS string literal and injects it into an iframe:
//   <!doctype html><html lang="…"><head><meta charset="utf-8"><style>{fonts}</style>
//   <style>{STYLE}</style></head><body><div id="root"></div><script>{BUNDLE}</script></body></html>
// The three tool pages are complete HTML documents whose "</script>" is stored as "<#/script".
//
// Usage: node scripts/extract-vendor.mjs [--check]
//   --check  re-extract into memory and compare with vendor/ and vendor/manifest.json (no writes)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CHECK = process.argv.includes('--check');
const SOURCES = ['legacy/app.zh-Hant.html', 'legacy/app.en.html'];

const ITEMS = [
  { dir: 'sequence-editor', file: 'bundle.js', name: 'Bf', what: 'Power-sequence editor (React 19.2.8 bundle)', host: 'window.afSeqHost = { lang, getDoc(), change(doc, designId) }; editor sets window.afSeqApi = { load, undo, redo, getDoc, designId, openExport, copyTable, canUndo, canRedo }', frame: 'af2-seq-frame' },
  { dir: 'sequence-editor', file: 'style.css', name: 'Ef', what: 'Power-sequence editor styles' },
  { dir: 'flowchart-editor', file: 'bundle.js', name: '$f', what: 'Flowchart editor (React 19.2.8 bundle)', host: 'window.afFlowHost = { lang, images, getDoc(), change(doc, designId), title(), ready() }; editor sets window.afFlowApi = { load, undo, redo, openExport, closeMenus }', frame: 'af2-flow-frame' },
  { dir: 'flowchart-editor', file: 'style.css', name: 'Hf', what: 'Flowchart editor styles' },
  { dir: 'rsi-bom', file: 'bundle.js', name: 'fg', what: 'RSI BOM Converter (React 19.2.8 + JSZip 3.10.1 bundle)', host: 'window.afRsiHost = { lang, close(), toast(text) }', frame: 'af2-tool-frame' },
  { dir: 'rsi-bom', file: 'style.css', name: 'gg', what: 'RSI BOM Converter styles' },
  { dir: 'tools', file: 'edid.html', name: 'mg', what: 'EDID Generator (standalone page)', host: 'window.afEdidHost = { lang, close(), toast(text) }', unescapeScript: true },
  { dir: 'tools', file: 'hex.html', name: 'vg', what: 'Hex/Bin Editor & Compare (standalone page)', host: 'window.afHexHost = { lang, close(), toast(text) }', unescapeScript: true },
  { dir: 'tools', file: 'pattern.html', name: 'xg', what: 'Pattern Generator (standalone page)', host: 'window.afPgHost = { lang, close(), toast(text) }', unescapeScript: true },
];

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

/** Find `var NAME=<literal>` in the shell script and return the decoded string + line range. */
function extract(text, name) {
  const s0 = text.indexOf('<script id="af20-shell">');
  const e0 = text.indexOf('</script>', s0);
  if (s0 < 0 || e0 < 0) throw new Error('af20-shell script not found');
  const shell = text.slice(s0, e0);
  const lineOf = i => text.slice(0, s0 + i).split('\n').length;
  const re = /(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*(['"`])/g;
  let m;
  while ((m = re.exec(shell))) {
    const q = m[2];
    const start = m.index + m[0].length - 1; // opening quote
    let j = start + 1, interpolations = 0;
    while (j < shell.length) {
      const c = shell[j];
      if (c === '\\') { j += 2; continue; }
      if (q === '`' && c === '$' && shell[j + 1] === '{') interpolations++;
      if (c === q) break;
      j++;
    }
    if (m[1] === name && j - start > 5000) {
      if (interpolations) throw new Error(`${name}: template literal with \${} is not a plain string`);
      const literal = shell.slice(start, j + 1);
      // the slice is exactly one string literal (scanned above), so evaluating it runs no code
      const value = new Function(`"use strict";return ${literal};`)();
      return { value, from: lineOf(start), to: lineOf(j) };
    }
    re.lastIndex = j + 1;
  }
  throw new Error(`string ${name} not found`);
}

const results = SOURCES.map(src => {
  const text = fs.readFileSync(src, 'utf8');
  return ITEMS.map(it => {
    const { value, from, to } = extract(text, it.name);
    return { ...it, src, from, to, content: it.unescapeScript ? value.replaceAll('<#/script', '</script') : value };
  });
});

// both locales must carry identical bundles (audit §3)
for (let i = 0; i < ITEMS.length; i++) {
  if (results[0][i].content !== results[1][i].content) throw new Error(`${ITEMS[i].dir}/${ITEMS[i].file} differs between zh-Hant and en`);
}

// the embedded Source Han Sans TC subset lives in the V2 wrapper, index.html line 3
// (`const AF_FONT_CSS="@font-face…"`); V2 put it in a <style id="af2-fonts"> of the app and of each editor frame
function extractFont() {
  const lines = fs.readFileSync('index.html', 'utf8').split('\n');
  const n = lines.findIndex(l => l.startsWith('const AF_FONT_CSS='));
  if (n < 0) throw new Error('AF_FONT_CSS not found in index.html');
  // the line goes on after the literal (afWithFont): scan to the closing quote
  const rest = lines[n].slice('const AF_FONT_CSS='.length);
  if (rest[0] !== '"') throw new Error('AF_FONT_CSS is not a string literal');
  let j = 1;
  while (j < rest.length && rest[j] !== '"') j += rest[j] === '\\' ? 2 : 1;
  const literal = rest.slice(0, j + 1);
  const value = new Function(`"use strict";return ${literal};`)();
  return { dir: 'fonts', file: 'source-han-sans-tc.css', name: 'AF_FONT_CSS', what: 'Source Han Sans TC subset, regular and bold, as @font-face with woff2 data URLs (SIL OFL 1.1)', src: 'index.html', from: n + 1, to: n + 1, content: value };
}

const items = [...results[0], extractFont()];
const manifest = {
  source: 'ArchFlow V2.10.1, legacy/app.zh-Hant.html (identical in legacy/app.en.html)',
  generatedBy: 'scripts/extract-vendor.mjs',
  files: Object.fromEntries(items.map(it => [`${it.dir}/${it.file}`, {
    variable: it.name, ...(it.src === 'index.html' ? { source: 'index.html' } : {}), lines: `${it.from}-${it.to}`, bytes: Buffer.byteLength(it.content), sha256: sha256(it.content), what: it.what,
  }])),
};

if (CHECK) {
  const problems = [];
  const saved = fs.existsSync('vendor/manifest.json') ? JSON.parse(fs.readFileSync('vendor/manifest.json', 'utf8')) : null;
  if (!saved) problems.push('vendor/manifest.json missing');
  for (const it of items) {
    const rel = `${it.dir}/${it.file}`, p = path.join('vendor', rel);
    if (!fs.existsSync(p)) { problems.push(`${p} missing`); continue; }
    const disk = fs.readFileSync(p, 'utf8');
    if (sha256(disk) !== manifest.files[rel].sha256) problems.push(`${p} does not match the V2.10.1 source (edited?)`);
    if (saved && saved.files[rel]?.sha256 !== manifest.files[rel].sha256) problems.push(`manifest hash for ${rel} is stale`);
  }
  if (problems.length) { console.error(problems.map(p => '✗ ' + p).join('\n')); process.exit(1); }
  console.log(`✓ vendor/ matches V2.10.1 (${items.length} files)`);
  process.exit(0);
}

for (const it of items) {
  fs.mkdirSync(path.join('vendor', it.dir), { recursive: true });
  fs.writeFileSync(path.join('vendor', it.dir, it.file), it.content);
}
fs.writeFileSync('vendor/manifest.json', JSON.stringify(manifest, null, 2) + '\n');

// one VENDOR.md per directory
for (const dir of [...new Set(items.map(it => it.dir))]) {
  const own = items.filter(it => it.dir === dir);
  const main = own.find(it => it.host);
  const lines = [
    `# vendor/${dir}`,
    '',
    '**Do not edit.** Extracted byte for byte from ArchFlow V2.10.1 by `scripts/extract-vendor.mjs`;',
    '`npm run check:vendor` fails if any file here changes. There is no source code for these bundles',
    '(docs/v3-audit.md §5); V3 talks to them only through the host interface below.',
    '',
    '| File | V2 variable | Lines in legacy/app.zh-Hant.html | Bytes | SHA-256 |',
    '|---|---|---|---|---|',
    ...own.map(it => { const f = manifest.files[`${it.dir}/${it.file}`]; return `| \`${it.file}\` | \`${it.name}\`${it.src === 'index.html' ? ' (index.html)' : ''} | ${f.lines} | ${f.bytes} | \`${f.sha256.slice(0, 16)}…\` |`; }),
    '',
    '## What it is',
    '',
    ...own.map(it => `- \`${it.file}\`: ${it.what}`),
    '',
  ];
  if (main?.host) {
    lines.push('## Host interface (provided by V3, see src/designs/* or src/tools/*)', '', '```', main.host, '```', '');
  }
  if (dir === 'fonts') {
    lines.push('## How V2 used it', '', 'The V2 wrapper (index.html) inserted it as `<style id="af2-fonts">` into the app and into the',
      'sequence, flowchart and BOM frames. V3 does the same (src/styles/fonts.ts). Licence: SIL Open Font License 1.1 (THIRD_PARTY.md).', '');
  } else if (!own.some(it => it.unescapeScript)) {
    lines.push('## How V2 mounted it', '', 'An iframe whose `srcdoc` is:', '', '```html',
      '<!doctype html><html lang="zh-Hant|en"><head><meta charset="utf-8"><style>{embedded fonts}</style>',
      '<style>{style.css}</style></head><body><div id="root"></div><script>{bundle.js}</script></body></html>', '```', '');
  } else {
    lines.push('## How V2 mounted it', '', 'Each `.html` file is a complete page, loaded as the `srcdoc` of an `af2-tool-frame` iframe.', '');
  }
  fs.writeFileSync(path.join('vendor', dir, 'VENDOR.md'), lines.join('\n'));
}
console.log(Object.entries(manifest.files).map(([f, v]) => `${f.padEnd(30)} ${String(v.bytes).padStart(8)}  L${v.lines}`).join('\n'));
console.log('✓ wrote vendor/ (zh-Hant and en sources identical)');
