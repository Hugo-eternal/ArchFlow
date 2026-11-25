// Re-embed src/app.<locale>.html into index.html (the single file users open).
// Usage: node tools/pack.mjs        (edit src/, then run this before committing)
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const lines = fs.readFileSync(root + 'index.html', 'utf8').split('\n');
const i = lines.findIndex(l => l.startsWith('const sources='));
if (i < 0) throw new Error('const sources= line not found in index.html');
const old = JSON.parse(lines[i].slice('const sources='.length).replace(/;\s*$/, ''));
const next = {};
for (const locale of Object.keys(old)) {
  next[locale] = fs.readFileSync(root + `src/app.${locale}.html`).toString('base64');
}
lines[i] = 'const sources=' + JSON.stringify(next) + ';';
fs.writeFileSync(root + 'index.html', lines.join('\n'));
console.log('index.html updated for', Object.keys(next).join(', '));
