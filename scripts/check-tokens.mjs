#!/usr/bin/env node
// Design-token check (V3 step 3.4):
//  1. CSS in src/ other than src/styles/tokens.css uses no raw colours (#hex, rgb(), hsl()) —
//     only var(--token);
//  2. every var(--x) used in src/ CSS is defined in tokens.css;
//  3. text / background token pairs meet WCAG contrast (4.5:1 text, 3:1 large text / UI)
//     in both the light and the dark theme.
import fs from 'node:fs';
import path from 'node:path';

const TOKENS = 'src/styles/tokens.css';
const css = fs.readFileSync(TOKENS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const problems = [];

// --- token tables: light = first :root block, dark = the [data-theme="dark"] block ---------
const block = re => { const m = css.match(re); return m ? m[1] : ''; };
const parse = body => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const light = parse(block(/^:root\s*\{([\s\S]*?)\n\}/m));
const dark = { ...light, ...parse(block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)) };
const darkMedia = parse(block(/prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\n\s*\}/));
for (const k of Object.keys(darkMedia)) if (darkMedia[k] !== dark[k]) problems.push(`dark theme: ${k} differs between @media and [data-theme="dark"]`);
for (const k of Object.keys(parse(block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)))) if (!(k in darkMedia)) problems.push(`dark theme: ${k} missing in @media block`);

// --- usage in the rest of src/ ---------------------------------------------------------------
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const RAW = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
for (const f of walk('src').filter(f => f.endsWith('.css'))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) if (!(m[1] in light)) problems.push(`${f}: var(${m[1]}) is not defined in ${TOKENS}`);
  if (path.resolve(f) === path.resolve(TOKENS)) continue;
  text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n').forEach((line, i) => {
    if (RAW.test(line)) problems.push(`${f}:${i + 1}: raw colour — use a token`);
  });
}

// --- contrast --------------------------------------------------------------------------------
const hex = v => { const m = /^#([0-9a-f]{6})$/i.exec(v); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; };
const lum = c => { const [r, g, b] = c.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [
  ['--color-text', '--color-surface', 4.5], ['--color-text', '--color-board', 4.5], ['--color-text', '--color-surface-2', 4.5],
  ['--color-muted', '--color-surface', 4.5], ['--color-muted', '--color-board', 4.5], ['--color-faint', '--color-surface', 4.5],
  ['--color-on-ink', '--color-ink', 4.5], ['--color-on-ink-2', '--color-ink', 4.5],
  ['--color-on-accent', '--color-accent', 4.5], ['--color-accent', '--color-surface', 4.5], ['--color-danger', '--color-surface', 4.5],
  ['--color-text', '--color-accent-tint', 4.5], ['--color-text', '--color-selection', 4.5],
  ['--wire-signal', '--color-board', 3], ['--wire-power', '--color-board', 3], ['--wire-clock', '--color-board', 3], ['--wire-bus', '--color-board', 3],
  ['--color-rule', '--color-surface', 1.2],
  // diagram blocks / ports (3.18)
  ['--block-text', '--block-fill', 4.5], ['--block-subtitle', '--block-fill', 4.5], ['--port-label', '--block-fill', 4.5],
  ['--port-label', '--color-board', 4.5], ['--block-border', '--block-fill', 1.5], ['--port-stroke', '--port-fill', 3],
  ['--selection-stroke', '--color-board', 3],
  // wires (3.19)
  ['--wire-label', '--wire-label-halo', 4.5], ['--junction-fill', '--color-board', 3],
  ['--part-stroke', '--color-board', 3], ['--part-label', '--color-board', 4.5],
  ...['unknown', 'negative', 'core', 'io', 'logic', 'mid', 'high'].map(b => [`--rail-${b}`, '--rail-surface', 4.5]),
  ...['teal', 'blue', 'amber', 'gray'].flatMap(c => [[`--frame-${c}-ink`, `--frame-${c}-tab`, 4.5], [`--frame-${c}-line`, '--color-board', 1.5]]),
];
const rows = [];
for (const [theme, t] of [['light', light], ['dark', dark]]) for (const [fg, bg, min] of PAIRS) {
  const a = hex(t[fg]), b = hex(t[bg]);
  if (!a || !b) { problems.push(`${theme}: ${fg} / ${bg} must be #rrggbb`); continue; }
  const r = ratio(a, b);
  rows.push(`${theme.padEnd(5)} ${fg.padEnd(18)} on ${bg.padEnd(20)} ${r.toFixed(2).padStart(5)} (≥ ${min})`);
  if (r < min) problems.push(`${theme}: ${fg} on ${bg} contrast ${r.toFixed(2)} < ${min}`);
}
if (process.argv.includes('--verbose')) console.log(rows.join('\n'));
console.log(`tokens: ${Object.keys(light).length} defined, ${PAIRS.length * 2} contrast pairs checked`);
if (problems.length) { console.error(problems.map(p => '✗ ' + p).join('\n')); process.exit(1); }
console.log('✓ tokens only, all defined, contrast OK in light and dark');
