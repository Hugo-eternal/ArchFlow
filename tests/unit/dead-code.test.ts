// module: core, io, shell — step 3.43: the dead code and retired features of V2 (audit §4) are
// not ported. Scans every source file under src/ for the V2 names that only existed for them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_SCHEMAS } from '../../src/io/schema';
import { APP_VERSION } from '../../src/version';

function sources(dir = 'src'): { file: string; text: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    // comments may name the V2 code they replace; only code counts
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    return /\.(ts|tsx|css|json)$/.test(e.name) ? [{ file: p, text: strip(fs.readFileSync(p, 'utf8')) }] : [];
  });
}

/** audit §4.2–4.5: retired feature → the V2 names that only it used. */
const RETIRED: Record<string, RegExp> = {
  'workspace heading (§4.2)': /\b(cleanHeading|renderHeading|headingBounds|appendHeadingExport|openHeading|headingDialog|headingBtn)\b/,
  'hidden "both" project type (§4.2)': /\b(allowedWorkspace|acceptLoadedProject)\b|projectType.{0,10}both/,
  'V1 circuit / current workspaces (§4.2)': /\b(switchWorkspace|activeWorkspace|storeWorkspace|tab-circuit|tab-current)\b/,
  'version 4 project format (§4.2)': /\bversion\s*[:=]\s*4\b/,
  'legacy copper schedule style (§4.2)': /\b(legacyCopper|copperToCustom)\b/,
  'off-grid legacy adapters (§4.2)': /\b(roLegacyNote|ggLegacy)\b/,
  'archflowLocalization inference (§4.2)': /\b(afInferLegacyBindings|archflowLocalization)\b/,
  'en text tidy (§4.2)': /v147-en-text-tidy/,
  'version text rewriting (§4.2)': /\b(af-brand-version|release-lock|v4VersionFooter)\b/,
  'RC2 / RC3 preview dialogs, ro / rc dialogs (§4.3)': /\b(uiDialog|ssPreview|ssMode|ssScope|rcPortDialog|rcAutoDialog|rcPortAssess)\b/,
  'clicking hidden V1 elements (§4.1)': /getElementById\([^)]*\)\s*\??\.click\(\)|\bz\(\s*['"][a-zA-Z]+['"]\s*\)/,
};

describe('audit §4: retired V2 features are not ported', () => {
  const files = sources();
  for (const [what, re] of Object.entries(RETIRED)) {
    it(what, () => {
      expect(files.filter(f => re.test(f.text)).map(f => f.file)).toEqual([]);
    });
  }

  it('the review flag is not in the schema (§4.5)', () => {
    expect(JSON.stringify(Object.keys(DATA_SCHEMAS))).not.toMatch(/review/);
    expect(files.filter(f => f.file.startsWith('src/io') && /\breview\b/.test(f.text)).map(f => f.file)).toEqual([]);
  });

  it('one version constant (§4.2)', () => {
    expect(APP_VERSION).toMatch(/^3\.0\.0/);
    const literal = files.filter(f => f.file !== path.join('src', 'version.ts') && /['"]V?[0-9]+\.[0-9]+\.[0-9]+(-dev)?['"]/.test(f.text) && /version/i.test(f.text));
    expect(literal.map(f => f.file)).toEqual([]);
  });
});
