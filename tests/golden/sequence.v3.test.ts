// module: designs:sequence — step 3.30: the V3 sequence module against V2.10.1: the four templates
// are V2's examples in both languages (the first one also as V2 creates it), the clean-up of
// documents is V2's `jf` (the golden document stays the same), blank designs.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from '../helpers/load-app.js';
import { convertProject } from '../tools/v2-to-v3';
import { setLocale, t, type Locale } from '../../src/core/i18n';
import { validateData } from '../../src/io/schema';
import { templateKeys } from '../../src/designs/module';
import { sequenceDesign, sequenceSrcdoc } from '../../src/designs/sequence';
import { sanitizeSequence } from '../../src/designs/sequence/sanitize';
import templates from '../../src/designs/sequence/templates/templates.json';
import zh from '../../i18n/zh-Hant.json';
import en from '../../i18n/en.json';
import type { SequenceDoc } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');

describe('sequence module', () => {
  it('blank design; four templates, valid and in both languages', () => {
    expect(sequenceDesign.create()).toEqual({ name: '', data: { name: '', rails: [] } });
    expect(sequenceDesign.templates.map(x => x.id)).toEqual(['display', 'lcd', 'fpga', 'mcu']);
    for (const locale of ['zh-Hant', 'en'] as const) {
      setLocale(locale);
      for (const tpl of sequenceDesign.templates) {
        const { name, data } = sequenceDesign.create({ template: tpl.id });
        expect(validateData('sequence', data), tpl.id).toEqual([]);
        expect(name).toBe(t(tpl.label));
        expect(JSON.stringify(data)).not.toContain('@i18n:');
      }
    }
    for (const k of templateKeys(templates)) { expect(zh).toHaveProperty([k]); expect(en).toHaveProperty([k]); }
  });

  it('clean-up is V2 jf: keeps every golden value (adds defaults such as edge "end"), idempotent; bad rows fixed', () => {
    const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/sequence/__snapshots__/project.v3.json'), 'utf8')).designs[0].data as SequenceDoc;
    const clean = sanitizeSequence(golden);
    expect(clean).toMatchObject(golden);
    expect((clean.rails[0] as { on: { edge: string } }).on.edge).toBe('end');
    expect(sanitizeSequence(clean)).toEqual(clean);
    const out = sanitizeSequence({ name: 'x'.repeat(150), rails: [
      { id: 'a', kind: 'weird', v: 99999, color: 'red', on: { after: 'ghost', delay: -5 }, off: {} },
      { id: 'a', name: 'dup' }, { id: 'bad id!' }, null,
    ] });
    expect(out.name).toHaveLength(100);
    expect(out.rails).toHaveLength(1);
    expect(out.rails[0]).toMatchObject({ id: 'a', name: 'Row', kind: 'rail', v: 10000, color: '#2B5C8A', on: { after: null, edge: 'end', delay: 0, ramp: 0 } });
  });

  it('the frame document holds the vendor style and bundle, in the interface language', () => {
    const doc = sequenceSrcdoc('en');
    expect(doc.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(doc).toContain(fs.readFileSync(path.join(ROOT, 'vendor/sequence-editor/style.css'), 'utf8'));
    expect(doc.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('golden: the first template is the document V2.10.1 creates', () => {
  const apps: { close(): Promise<void> }[] = [];
  afterAll(async () => { for (const a of apps) await a.close(); });
  for (const locale of ['zh-Hant', 'en'] as Locale[]) {
    it(locale, async () => {
      const app = await openApp({ locale });
      apps.push(app);
      await app.createProject('sequence');
      const v2 = convertProject(await app.eval(() => projectData()));
      setLocale(locale);
      const made = sequenceDesign.create({ template: 'display' });
      expect(made.name).toBe(v2.designs[0].name);
      expect(made.data).toEqual(v2.designs[0].data);
    }, 60000);
  }
});
