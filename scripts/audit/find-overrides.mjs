#!/usr/bin/env node
// Read-only audit (V3 step 1.1): find every global function / handler that is
// overridden with the "const base = X; X = function(){ … base() … }" chain.
//
// Usage:
//   node scripts/audit/find-overrides.mjs [legacy/app.zh-Hant.html] [--json]
//
// Output: per target — original definition line(s), number of override layers,
// and for each layer: line, alias that keeps the previous layer, enclosing
// <script id>, and the nearest preceding comment (a hint of the layer's purpose).
// The minified React bundle (<script id="af20-shell">) is skipped: it has no
// override chains of its own and would only add noise.

import fs from 'node:fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const file = args.find(a => !a.startsWith('--')) || 'legacy/app.zh-Hant.html';
const text = fs.readFileSync(file, 'utf8');

// ---- line index -----------------------------------------------------------
const lineStarts = [0];
for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
const lineOf = idx => {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
};

// ---- skip the minified bundle ------------------------------------------------
const skip = [];
{
  const s = text.indexOf('<script id="af20-shell">');
  if (s >= 0) skip.push([s, text.indexOf('</script>', s)]);
}
const skipped = idx => skip.some(([a, b]) => idx >= a && idx < b);

// ---- enclosing <script> block --------------------------------------------------
const scripts = [];
{
  const re = /<script(?:\s+id="([^"]+)")?[^>]*>/g;
  let m, n = 0;
  while ((m = re.exec(text))) scripts.push({ at: m.index, id: m[1] || `script#${++n}`, line: lineOf(m.index) });
}
const scriptAt = idx => { let cur = null; for (const s of scripts) { if (s.at <= idx) cur = s; else break; } return cur; };

// ---- nearest preceding comment (within 12 lines, same script) --------------------
const comments = [];
{
  const re = /(?:^|[\s;{}()])(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  let m;
  while ((m = re.exec(text))) {
    const at = m.index + m[0].indexOf(m[1]);
    if (skipped(at)) continue;
    // ignore "//" inside URLs and strings such as 'http://…'
    const before = text.slice(Math.max(0, at - 6), at);
    if (/[:'"`]$/.test(before)) continue;
    comments.push({ at, line: lineOf(at), text: m[1].replace(/^\/\*+|\*+\/$|^\/\/\s*/g, '').replace(/\s+/g, ' ').trim().slice(0, 140) });
  }
}
const commentBefore = (idx, scriptStart) => {
  const line = lineOf(idx);
  let best = null;
  for (const c of comments) {
    if (c.at > idx) break;
    if (c.at >= scriptStart && line - c.line <= 12 && c.text) best = c;
  }
  return best;
};

// ---- targets: declared functions, window.* functions, DOM handlers --------------
const declared = new Map(); // name -> [lines]
{
  const re = /(?:^|[^\w$.])(?:async\s+)?function\s+([\w$]+)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    if (skipped(m.index)) continue;
    const name = m[1];
    if (!declared.has(name)) declared.set(name, []);
    declared.get(name).push(lineOf(m.index + m[0].search(/(?:async\s+)?function/)));
  }
}

const TARGET = String.raw`(?:window\.[\w$]+|\$\('[^']+'\)\.on\w+|[\w$]+)`;
// "const base = X;" and the guarded form "const base = typeof X==='function' ? X : null;"
// also the later names in a list: "const __undo = undo, __redo = redo;"
const aliasRe = new RegExp(String.raw`(?:\b(?:const|let|var)\s+|,\s*)([\w$]+)\s*=\s*(?:typeof\s+[\w$.]+\s*===?\s*'function'\s*\?\s*)?(${TARGET})(?=\s*(?:[;,]|:\s*null))`, 'g');
const assignRe = new RegExp(String.raw`(^|[^\w$.'"\`])(${TARGET})\s*=\s*(?=async\s|function\b|\([^()]*\)\s*=>|[\w$]+\s*=>)`, 'g');

const aliases = []; // {alias, target, at}
{
  let m;
  while ((m = aliasRe.exec(text))) {
    if (skipped(m.index)) continue;
    const [, alias, target] = m;
    if (alias === target) continue;
    aliases.push({ alias, target, at: m.index });
  }
}
const aliasedTargets = new Set(aliases.map(a => a.target));
// targets: anything saved under an alias, plus every declared function (a declared function
// reassigned without an alias is a full replacement — e.g. L624 scheduleLabel, found in step 2.6)
const isTarget = name => aliasedTargets.has(name) || declared.has(name);

const layers = new Map(); // target -> [{line, alias, script, comment}]
const prevAt = new Map(); // target -> text index of its previous override
{
  let m;
  while ((m = assignRe.exec(text))) {
    const at = m.index + m[1].length;
    if (skipped(at)) continue;
    const target = m[2];
    if (!isTarget(target)) continue;
    // a declaration ("const X = …") is not a reassignment
    const head = text.slice(Math.max(0, at - 8), at);
    if (/\b(?:const|let|var)\s+$/.test(head)) continue;
    // "const a = 1, X = y => …" declares a local, it does not reassign X
    if (m[1] === ',') {
      const stmt = Math.max(text.lastIndexOf(';', at), text.lastIndexOf('{', at), text.lastIndexOf('}', at), text.lastIndexOf('\n', at));
      if (/^\s*(?:const|let|var)\b/.test(text.slice(stmt + 1, at))) continue;
    }
    // Which saved copy does the new body call? Look at the body text (until the
    // next top-level statement is unknowable cheaply, so a bounded window) for any
    // alias name of this target that was defined before this point.
    const body = text.slice(at, at + 6000);
    const earlier = aliases.filter(a => a.target === target && a.at < at);
    const latest = earlier.at(-1) || null;
    const called = [...earlier].reverse().find(a => new RegExp(String.raw`(?<![\w$.])${a.alias.replace(/\$/g, '\\$')}\s*(?:\(|\.(?:apply|call)\b)`).test(body)) || null;
    const sc = scriptAt(at);
    const c = commentBefore(at, sc ? sc.at : 0);
    if (!layers.has(target)) layers.set(target, []);
    layers.get(target).push({
      line: lineOf(at),
      alias: called ? called.alias : null,
      // no saved copy called: this layer discards every earlier layer (or, for a DOM
      // handler / window function, it is the first assignment)
      replaces: !called,
      // calls an older saved copy than the latest one: the layers in between are dropped
      // ...i.e. the copy it calls was saved before the previous override of this target
      rollback: !!(called && prevAt.has(target) && called.at < prevAt.get(target)),
      script: sc ? sc.id : null,
      comment: c ? c.text : null,
    });
    prevAt.set(target, at);
  }
}

const result = [...layers.entries()]
  .map(([target, ls]) => {
    const bare = target.replace(/^window\./, '');
    return {
      target,
      kind: target.startsWith('$(') ? 'dom-handler' : target.startsWith('window.') ? 'window' : 'global',
      definedAt: declared.get(bare) || [],
      layers: ls.length,
      overrides: ls,
    };
  })
  .sort((a, b) => b.layers - a.layers || a.target.localeCompare(b.target));

if (asJson) {
  console.log(JSON.stringify({ file, skipped: skip.map(([a, b]) => [lineOf(a), lineOf(b)]), targets: result }, null, 2));
} else {
  const total = result.reduce((n, r) => n + r.layers, 0);
  console.log(`# Override chains in ${file}`);
  console.log(`\n${result.length} targets, ${total} override layers. Skipped bundle lines: ${skip.map(([a, b]) => `${lineOf(a)}–${lineOf(b)}`).join(', ') || 'none'}.\n`);
  console.log('Marks: `*` = calls no saved copy (replaces the whole chain so far, or is the first assignment);');
  console.log('`↶` = calls an older saved copy than the latest one (rolls back the layers in between).\n');
  console.log('| Target | Kind | Defined at | Layers | Override lines |');
  console.log('|---|---|---|---|---|');
  const mark = o => o.line + (o.replaces ? '*' : o.rollback ? '↶' : '');
  for (const r of result) console.log(`| \`${r.target}\` | ${r.kind} | ${r.definedAt.join(', ') || '—'} | ${r.layers} | ${r.overrides.map(mark).join(', ')} |`);
  for (const r of result) {
    console.log(`\n## \`${r.target}\` — ${r.layers} layer(s)`);
    for (const o of r.overrides) console.log(`- L${o.line} ${o.replaces ? '**replaces (no saved copy called)**' : '`' + o.alias + '`' + (o.rollback ? ' **(rollback)**' : '')} [${o.script ?? '?'}]${o.comment ? ' — ' + o.comment : ''}`);
  }
}
