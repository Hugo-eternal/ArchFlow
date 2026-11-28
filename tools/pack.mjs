// Re-embed legacy/app.<locale>.html into index.html (the single file users open).
// Usage: node tools/pack.mjs        (edit legacy/, then run this before committing)
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const lines = fs.readFileSync(root + 'index.html', 'utf8').split('\n');
const i = lines.findIndex(l => l.startsWith('const sources='));
if (i < 0) throw new Error('const sources= line not found in index.html');
const old = JSON.parse(lines[i].slice('const sources='.length).replace(/;\s*$/, ''));
const next = {};
for (const locale of Object.keys(old)) {
  next[locale] = fs.readFileSync(root + `legacy/app.${locale}.html`).toString('base64');
}
lines[i] = 'const sources=' + JSON.stringify(next) + ';';
// v2-fix B2/D9: the page title shows the single version constant from the app source.
const version = /const AF_VERSION='([^']+)'/.exec(fs.readFileSync(root + 'legacy/app.zh-Hant.html', 'utf8'))?.[1];
if (!version) throw new Error("const AF_VERSION='…' not found in legacy/app.zh-Hant.html");
for (const locale of Object.keys(next)) {
  if (!fs.readFileSync(root + `legacy/app.${locale}.html`, 'utf8').includes(`const AF_VERSION='${version}'`)) throw new Error(`legacy/app.${locale}.html: AF_VERSION is not ${version}`);
}
lines[0] = lines[0].replace(/<title>ArchFlow [^<]*<\/title>/, `<title>ArchFlow ${version}</title>`);
fs.writeFileSync(root + 'index.html', lines.join('\n'));
console.log('index.html updated for', Object.keys(next).join(', '), '·', version);
