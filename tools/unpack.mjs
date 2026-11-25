// Decode the app sources embedded in index.html into src/ so they can be read and edited.
// Usage: node tools/unpack.mjs
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const lines = fs.readFileSync(root + 'index.html', 'utf8').split('\n');
const i = lines.findIndex(l => l.startsWith('const sources='));
if (i < 0) throw new Error('const sources= line not found in index.html');
const sources = JSON.parse(lines[i].slice('const sources='.length).replace(/;\s*$/, ''));
fs.mkdirSync(root + 'src', { recursive: true });
for (const [locale, b64] of Object.entries(sources)) {
  fs.writeFileSync(root + `src/app.${locale}.html`, Buffer.from(b64, 'base64'));
  console.log(`src/app.${locale}.html`);
}
