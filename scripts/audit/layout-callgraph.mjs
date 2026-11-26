#!/usr/bin/env node
// Read-only audit (V3 step 3.36): the call graph of V2's "auto arrange / organize" (RC4), starting
// at v4Generate and the dialog's apply handler, so that only the functions actually reached are
// ported (plan §3 R7).
//
// Usage:
//   node scripts/audit/layout-callgraph.mjs [legacy/app.zh-Hant.html] [--json]
//
// How: every top-level definition outside the vendor bundles is collected — `function NAME(`,
// `NAME=function`, `NAME=(…)=>` / `NAME=x=>`, `const|let|var NAME=…` — with its line and source
// span (balanced braces); a definition of the form `const ALIAS=NAME;` is an override alias and
// resolves to NAME (its earlier layer). From the roots, every identifier in a reached body that
// names a definition is followed. Each reached name is listed with all its definition lines
// (several lines = an override chain; the last layer is what runs) and its callers.

import fs from 'node:fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const file = args.find(a => !a.startsWith('--')) || 'legacy/app.zh-Hant.html';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const LAST_ENGINE_LINE = 5300; // vendor bundles start at L5327

// ---- definitions ---------------------------------------------------------------
const defs = new Map();      // name -> [{ line, body }]
const aliases = new Map();   // alias -> name
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'catch', 'function', 'new', 'typeof', 'await', 'async']);

/** Index after the balanced group that opens at `i` ((), {}, []), ignoring strings and template literals. */
function close(text, i) {
  let depth = 0, q = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if ((c === '}' || c === ')' || c === ']') && --depth === 0) return i + 1;
  }
  return text.length;
}

/** An expression from `i` to the first `;` / `,` outside brackets (an arrow function's expression body). */
function expression(text, i) {
  let depth = 0, q = null;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') { if (--depth < 0) return text.slice(i, j); }
    else if ((c === ';' || c === ',') && depth === 0) return text.slice(i, j);
  }
  return text.slice(i);
}

/** The whole function starting at `start` (`function …(…){…}`, `(…)=>{…}`, `x=>expr`, `async …`). */
function span(text, start) {
  let i = start;
  const skip = () => { while (/\s/.test(text[i] ?? '')) i++; };
  skip();
  if (text.startsWith('async', i)) { i += 5; skip(); }
  if (text.startsWith('function', i)) {
    const open = text.indexOf('(', i), body = text.indexOf('{', close(text, open));
    return text.slice(start, close(text, body));
  }
  // arrow: (params) => body | name => body
  i = text[i] === '(' ? close(text, i) : i + (/^[A-Za-z_$][\w$]*/.exec(text.slice(i))?.[0].length ?? 0);
  skip();
  if (!text.startsWith('=>', i)) return text.slice(start, i);
  i += 2; skip();
  return text[i] === '{' ? text.slice(start, close(text, i)) : text.slice(start, i) + expression(text, i);
}

const add = (name, line, body) => { if (!defs.has(name)) defs.set(name, []); defs.get(name).push({ line, body }); };
const DEF = /(?:^|[;{}\s(,])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?:^|[;{}\s,])(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?!=)/g;

// scan the engine part as one text (definitions may span lines), keeping line numbers
const engine = lines.slice(0, LAST_ENGINE_LINE).join('\n');
const starts = [0];
for (let i = 0; i < engine.length; i++) if (engine[i] === '\n') starts.push(i + 1);
const lineOf = idx => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
DEF.lastIndex = 0;
for (let m; (m = DEF.exec(engine));) {
  const name = m[1] || m[2];
  if (!name || KEYWORDS.has(name)) continue;
  const at = m.index + m[0].length;
  if (m[1]) { add(name, lineOf(m.index + m[0].length - 1), span(engine, m.index + m[0].search(/(?:async\s+)?function/))); continue; }
  const rhs = engine.slice(at, at + 400);
  const alias = /^([A-Za-z_$][\w$]*)\s*[;,]/.exec(rhs);
  if (alias && /^(?:const|let|var)\s/.test(m[0].trim().replace(/^[;{}\s,]+/, ''))) { aliases.set(name, alias[1]); continue; }
  if (/^(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(rhs)) add(name, lineOf(at), span(engine, at));
}

// ---- reachability -----------------------------------------------------------
const resolve = name => { const seen = new Set(); while (aliases.has(name) && !seen.has(name)) { seen.add(name); name = aliases.get(name); } return name; };
const IDENT = /[A-Za-z_$][\w$]*/g;
const roots = ['v4Generate', 'v4Select', 'v4Draw', 'v4Locate'];
// the apply handler (`v4Q('v4Apply').onclick=()=>{…}`) is not a named function: take its line as a root body
const applyLine = lines.findIndex(l => l.startsWith("v4Q('v4Apply').onclick="));
// Only the layout engine is followed (RC2 ro*, RC3 ui*, ss*, rc*, gg* grid helpers, RC4 v4*); any
// other definition it calls (render, commit, node, edge, notify …) is an external dependency:
// listed with its callers, not followed — V3 has its own model / render / commit for those.
const ENGINE = /^(v4|ui|ro|ss|rc|gg)[A-Z]/;
const reached = new Map();   // name -> Set(callers)
const external = new Map();  // name -> Set(callers)
const queue = [];
const visit = (name, from) => {
  name = resolve(name);
  if (!defs.has(name)) return;
  if (!ENGINE.test(name)) { if (from) { if (!external.has(name)) external.set(name, new Set()); external.get(name).add(from); } return; }
  if (!reached.has(name)) { reached.set(name, new Set()); queue.push(name); }
  if (from) reached.get(name).add(from);
};
for (const r of roots) visit(r, null);
if (applyLine >= 0) for (const id of lines[applyLine].match(IDENT) ?? []) visit(id, '(apply handler)');
while (queue.length) {
  const name = queue.shift();
  for (const d of defs.get(name)) for (const id of new Set(d.body.match(IDENT) ?? [])) if (id !== name || d !== defs.get(name)[0]) visit(id, name);
}

// ---- output --------------------------------------------------------------------
const rows = [...reached.keys()].sort().map(name => ({
  name, lines: defs.get(name).map(d => d.line), bytes: defs.get(name).reduce((s, d) => s + d.body.length, 0),
  callers: [...reached.get(name)].sort(),
}));
const ext = [...external.keys()].sort().map(name => ({ name, lines: defs.get(name).map(d => d.line), callers: [...external.get(name)].sort() }));
if (asJson) { console.log(JSON.stringify({ roots, applyLine: applyLine + 1, rows, external: ext }, null, 2)); process.exit(0); }
console.log(`roots: ${roots.join(', ')}, apply handler L${applyLine + 1}`);
console.log(`${rows.length} functions reached, ${rows.reduce((s, r) => s + r.bytes, 0)} bytes of source`);
for (const r of rows) console.log(`${r.name.padEnd(28)} L${r.lines.join(',L').padEnd(22)} ${String(r.bytes).padStart(6)}  ← ${r.callers.slice(0, 6).join(', ')}${r.callers.length > 6 ? ' …' : ''}`);
console.log(`\nexternal dependencies (not followed): ${ext.length}`);
for (const r of ext) console.log(`${r.name.padEnd(28)} L${r.lines.join(',L').padEnd(22)} ← ${r.callers.slice(0, 6).join(', ')}${r.callers.length > 6 ? ' …' : ''}`);
