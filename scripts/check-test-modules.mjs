#!/usr/bin/env node
// Every test file must start with "// module: <x>[, <y>…]" so tests can be picked by module
// (see docs/v3-prompts.md §1, change levels). Prints the module → files index; exits 1 on a
// missing or unknown tag.
//   node scripts/check-test-modules.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';

const KNOWN = /^(core|model|router|render|inspector|io|export|shell|layout|designs:(function|power|schedule|sequence|flowchart)|tools:(bom|edid|hex|pattern))$/;
const files = [];
const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) { if (!['__snapshots__', 'helpers', 'node_modules'].includes(e.name)) walk(p); }
  else if (/\.(test|spec)\.(js|ts)$/.test(e.name)) files.push(p);
} };
walk('tests');

const index = {}, problems = [];
for (const f of files.sort()) {
  const m = fs.readFileSync(f, 'utf8').split('\n')[0].match(/^\/\/ module: ([^—]+?)(?:\s+—|$)/);
  if (!m) { problems.push(`${f}: first line must be "// module: <x>"`); continue; }
  for (const mod of m[1].split(',').map(s => s.trim())) {
    if (!KNOWN.test(mod)) problems.push(`${f}: unknown module "${mod}"`);
    (index[mod] ||= []).push(f);
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(index, null, 2));
else for (const [mod, fs_] of Object.entries(index).sort()) console.log(`${mod.padEnd(20)} ${fs_.join(', ')}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
