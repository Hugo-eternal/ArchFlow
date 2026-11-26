// module: designs:flowchart — step 3.31: the V3 flowchart module against V2.10.1: the template is
// the document V2 creates (both languages), the clean-up of returned documents is V2's `Pf`
// (the V2 golden document is unchanged by it), blank designs, the frame document.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from '../helpers/load-app.js';
import { convertProject } from '../tools/v2-to-v3';
import { setLocale, t, type Locale } from '../../src/core/i18n';
import { validateData } from '../../src/io/schema';
import { templateKeys } from '../../src/designs/module';
import { flowchartDesign, flowchartSrcdoc } from '../../src/designs/flowchart';
import { emptyFlowchart, sanitizeFlowchart } from '../../src/designs/flowchart/sanitize';
import templates from '../../src/designs/flowchart/templates/templates.json';
import zh from '../../i18n/zh-Hant.json';
import en from '../../i18n/en.json';

const ROOT = path.resolve(__dirname, '../..');

describe('flowchart module', () => {
  it('blank design; the template is valid and in both languages', () => {
    expect(flowchartDesign.create()).toEqual({ name: '', data: emptyFlowchart() });
    for (const locale of ['zh-Hant', 'en'] as const) {
      setLocale(locale);
      const { name, data } = flowchartDesign.create({ template: 'lcd' });
      expect(validateData('flowchart', data)).toEqual([]);
      expect(name).toBe(t('template.flowchart.lcd.name'));
      expect(JSON.stringify(data)).not.toContain('@i18n:');
    }
    for (const k of templateKeys(templates)) { expect(zh).toHaveProperty([k]); expect(en).toHaveProperty([k]); }
  });

  it('clean-up is V2 Pf: the golden document is unchanged; bad input is fixed or emptied', () => {
    const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/flowchart/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
    expect(sanitizeFlowchart(golden)).toEqual(golden);
    expect(sanitizeFlowchart({ nodes: 'x' })).toEqual(emptyFlowchart());
    const out = sanitizeFlowchart({
      title: 'T', nodes: [{ id: 'a', type: 'process', w: 5000, color: 'pink' }, { id: 'b', type: 'decision' }, { id: 'c', type: 'nope' }],
      edges: [{ id: 'e1', from: 'b', to: 'a', label: '是' }, { from: 'a', to: 'c' }, { from: 'a', to: 'a' }],
      lanes: [{ id: 'L', w: 10 }], lineDefault: { color: 'ink', width: 'huge' },
    });
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes[0]).toMatchObject({ w: 800, h: 60, color: null });
    expect(out.edges).toEqual([expect.objectContaining({ id: 'e1', label: 'Y' })]);
    expect(out.lanes).toEqual([{ id: 'L', title: '', w: 140 }]);
    expect(out.lineDefault).toEqual({ color: 'ink', width: null, dash: false });
  });

  it('the frame document holds the vendor style and bundle; the host carries the shared image store', () => {
    const doc = flowchartSrcdoc('zh-Hant');
    expect(doc.startsWith('<!doctype html><html lang="zh-Hant">')).toBe(true);
    expect(doc).toContain(fs.readFileSync(path.join(ROOT, 'vendor/flowchart-editor/style.css'), 'utf8'));
    expect(flowchartDesign.embedded!.hostExtras!().images).toBeInstanceOf(Map);
  });
});

describe('golden: the template is the document V2.10.1 creates', () => {
  const apps: { close(): Promise<void> }[] = [];
  afterAll(async () => { for (const a of apps) await a.close(); });
  for (const locale of ['zh-Hant', 'en'] as Locale[]) {
    it(locale, async () => {
      const app = await openApp({ locale });
      apps.push(app);
      await app.createProject('flowchart');
      const v2 = convertProject(await app.eval(() => projectData()));
      setLocale(locale);
      const made = flowchartDesign.create({ template: 'lcd' });
      expect(made.name).toBe(v2.designs[0].name);
      expect(made.data).toEqual(v2.designs[0].data);
    }, 60000);
  }
});
