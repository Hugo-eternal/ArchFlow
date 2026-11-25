// module: designs:function — the V3 function module: blank / template creation, schema and
// i18n of the starter template, and the template against V2.10.1's own starter ("入門方塊圖" /
// "Starter block diagram") — same blocks, ports, wires and texts, and the same exported wire
// routes.
import { describe, it, expect, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import { convertProject } from '../tools/v2-to-v3';
import { functionDesign } from '../../src/designs/function';
import { templateKeys } from '../../src/designs/module';
import starter from '../../src/designs/function/templates/starter.json';
import { emptyDiagram } from '../../src/model/diagram';
import { validateData } from '../../src/io/schema';
import { exportSvg } from '../../src/export/svg';
import { setLocale, t, type Locale, type MessageKey } from '../../src/core/i18n';
import zh from '../../i18n/zh-Hant.json';
import en from '../../i18n/en.json';
import type { BlockDiagram } from '../../src/io/schema-types';

/** Ids replaced by positions, so two copies made with different random ids compare equal. */
function shape(d: BlockDiagram) {
  const block = new Map(d.blocks.map((b, i) => [b.id, i]));
  const port = new Map(d.blocks.flatMap(b => b.ports.map((p, i) => [p.id, `${block.get(b.id)}.${i}`] as const)));
  const end = (e: BlockDiagram['wires'][number]['a']) => ('block' in e ? port.get(e.port) : `j:${e.junction}`);
  return {
    blocks: d.blocks.map(({ id: _id, ports, ...b }) => ({ ...b, ports: ports.map(({ id: _p, ...p }) => p) })),
    wires: d.wires.map(({ id: _id, a, b, ...w }) => ({ ...w, a: end(a), b: end(b) })),
    texts: d.texts.map(({ id: _id, ...x }) => x),
    rest: { ...d, blocks: undefined, wires: undefined, texts: undefined },
  };
}
const wirePaths = (svg: string) => [...svg.matchAll(/<path d="(M[^"]*? L[^"]*)"/g)].map(m => {
  const n = [...m[1].matchAll(/-?\d+(?:\.\d+)?/g)].map(x => Math.round(Number(x[0]) * 2) / 2), out: string[] = [];
  for (let i = 0; i < n.length; i += 2) { const p = `${n[i]},${n[i + 1]}`; if (out.at(-1) !== p) out.push(p); }
  return out.join(' ');
}).sort();

describe('designs/function module', () => {
  it('creates a blank design', () => {
    expect(functionDesign.create()).toEqual({ name: '', data: emptyDiagram() });
    expect(() => functionDesign.create({ template: 'nope' })).toThrow();
  });

  it('the starter template is valid V3 data and every text is in both languages', () => {
    for (const locale of ['zh-Hant', 'en'] as const) {
      setLocale(locale);
      const { data, name } = functionDesign.create({ template: 'starter' });
      expect(validateData('function', data)).toEqual([]);
      expect(name).toBe(t('template.function.starter.name'));
      expect(JSON.stringify(data)).not.toContain('@i18n:');
    }
    const keys = templateKeys(starter);
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) { expect(zh).toHaveProperty([k]); expect(en).toHaveProperty([k]); }
    for (const tpl of functionDesign.templates) expect(t(tpl.label as MessageKey)).not.toBe(tpl.label);
  });
});

describe('golden: starter template vs V2.10.1', () => {
  const apps: { close(): Promise<void> }[] = [];
  afterAll(async () => { for (const a of apps) await a.close(); });

  for (const locale of ['zh-Hant', 'en'] as Locale[]) {
    it(`${locale}: same diagram and exported wire routes as V2's starter`, async () => {
      const app = await openApp({ locale });
      apps.push(app);
      await app.createProject('function');
      const v2 = convertProject(await app.eval(() => projectData()));
      const v2svg = await app.eval(() => exportSvgDocument(false).source) as string;
      const v2data = v2.designs[0].data as BlockDiagram;

      setLocale(locale);
      const made = functionDesign.create({ template: 'starter' });
      expect(made.name).toBe(v2.designs[0].name);
      expect(shape(made.data)).toEqual(shape(v2data));
      expect(wirePaths(v2svg)).toHaveLength(v2data.wires.length);
      expect(wirePaths(exportSvg(made.data).source)).toEqual(wirePaths(v2svg));
    }, 60000);
  }
});
