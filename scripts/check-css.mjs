#!/usr/bin/env node
// CSS hygiene for src/styles (V3 step 3.42; plan: "one set of design tokens, no duplicate rules,
// no needless !important"). Fails on:
//   - any `!important`;
//   - a property declared twice for the same selector in the same @-context (the first one is
//     dead: either a duplicate or an override that belongs in one rule);
//   - an `af-*` class that no source file under src/ mentions (dead rule). Classes built at run
//     time from a prefix (`af-wire-${kind}`, 'af-frame-' + colour …) count as used when the
//     prefix appears in a template or string.
// Token use (only var(--…) outside tokens.css, contrast) is scripts/check-tokens.mjs.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/styles';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.css')).map(f => path.join(DIR, f));
const code = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) code.push(fs.readFileSync(p, 'utf8')); } };
walk('src');
const source = code.join('\n');
const errors = [];

const seen = new Map();          // context + selector + property -> where
for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  if (/!important/.test(raw)) errors.push(`${f}: !important`);
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  const lineOf = i => text.slice(0, i).split('\n').length;
  const stack = [], re = /([^{}]+)\{|\}/g;
  for (let m; (m = re.exec(text));) {
    if (m[0] === '}') { stack.pop(); continue; }
    const head = m[1].trim();
    if (head.startsWith('@')) { stack.push(head.replace(/\s+/g, ' ')); continue; }
    const end = text.indexOf('}', re.lastIndex), body = text.slice(re.lastIndex, end);
    re.lastIndex = end + 1;
    const props = body.split(';').map(d => d.split(':')[0].trim()).filter(Boolean);
    for (const sel of head.split(',').map(s => s.trim().replace(/\s+/g, ' '))) {
      for (const p of props) {
        const key = `${stack.join(' | ')} :: ${sel} :: ${p}`, at = `${f}:${lineOf(m.index + m[0].length)}`;
        if (seen.has(key)) errors.push(`${at}: "${sel}" sets ${p} again (first at ${seen.get(key)})${stack.length ? ' in ' + stack.join(' ') : ''}`);
        else seen.set(key, at);
      }
    }
  }
}

const classes = new Set();
for (const f of files) for (const c of fs.readFileSync(f, 'utf8').matchAll(/\.(af-[\w-]+)/g)) classes.add(c[1]);
for (const c of [...classes].sort()) {
  if (source.includes(c)) continue;
  let prefix = c, dynamic = false;
  while (!dynamic && prefix.includes('-', 3)) {
    prefix = prefix.replace(/[^-]+-?$/, '');
    dynamic = prefix.length > 3 && (source.includes(prefix + '${') || source.includes(`'${prefix}'`) || source.includes(`\`${prefix}`));
  }
  if (!dynamic) errors.push(`unused class .${c} (no file under src/ mentions it)`);
}

if (errors.length) { for (const e of errors) console.error('✗ ' + e); process.exit(1); }
console.log(`✓ css: ${files.length} files, ${classes.size} af-* classes, no !important, no repeated declarations, no unused classes`);
