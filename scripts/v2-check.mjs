// One-shot V2 verification (v2-fix): locale structure check, pack, legacy unit/golden, legacy E2E.
// Usage: npm run v2:check            (all steps)
//        npm run v2:check -- --quick (skip E2E)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const quick = process.argv.includes('--quick');

const steps = [];
if (fs.existsSync(root + 'tools/check-locales.mjs')) {
  steps.push(['locale structure', 'node', ['tools/check-locales.mjs']]);
}
steps.push(['pack index.html', 'node', ['tools/pack.mjs']]);
steps.push(['legacy unit + golden', 'npm', ['run', 'test:legacy']]);
if (!quick) steps.push(['legacy E2E', 'npm', ['run', 'test:legacy:e2e', '--', '--workers=1']]);

for (const [name, cmd, args] of steps) {
  console.log(`\n=== v2:check: ${name} ===`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nv2:check FAILED at: ${name}`);
    process.exit(r.status || 1);
  }
}
console.log(`\nv2:check passed (${steps.map(s => s[0]).join(', ')})`);
