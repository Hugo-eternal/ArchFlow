// module: designs:function, designs:schedule — step 3.43g: the six full examples of V2.10.1's
// start screen (block diagram LIB function0 / function1, power tree current0 / current1, schedule
// PLANS product / eco) as V3 templates: valid, in both languages, and the same as what V2 builds.
import { describe, it, expect, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import { convertProject } from '../tools/v2-to-v3';
import { functionDesign } from '../../src/designs/function';
import { scheduleDesign } from '../../src/designs/schedule';
import { validateData } from '../../src/io/schema';
import { exportSvg } from '../../src/export/svg';
import { setLocale, type Locale } from '../../src/core/i18n';
import type { BlockDiagram, ScheduleData } from '../../src/io/schema-types';

/** Ids replaced by positions (two copies made with different random ids compare equal). */
function shape(d: BlockDiagram) {
  const block = new Map(d.blocks.map((b, i) => [b.id, i]));
  const port = new Map(d.blocks.flatMap(b => b.ports.map((p, i) => [p.id, `${block.get(b.id)}.${i}`] as const)));
  const junction = new Map(d.junctions.map((j, i) => [j.id, i]));
  const end = (e: BlockDiagram['wires'][number]['a']) => ('block' in e ? port.get(e.port) : `j${junction.get(e.junction)}`);
  return {
    blocks: d.blocks.map(({ id: _id, ports, ...b }) => ({ ...b, ports: ports.map(({ id: _p, ...p }) => p) })),
    wires: d.wires.map(({ id: _id, a, b, ...w }) => ({ ...w, a: end(a), b: end(b) })),
    junctions: d.junctions.map(({ id: _id, ...j }) => j),
    texts: d.texts.map(({ id: _id, ...x }) => x),
    frames: d.frames.map(({ id: _id, ...x }) => x),
  };
}
function scheduleShape(d: ScheduleData) {
  const idx = new Map(d.tasks.map((t, i) => [t.id, i]));
  return {
    tasks: d.tasks.map(({ id: _id, ...t }) => t),
    links: d.links.map(({ id: _id, from, to, ...l }) => ({ ...l, from: idx.get(from), to: idx.get(to) })),
    texts: d.texts.map(({ id: _id, ...x }) => x),
    appearance: d.appearance, rules: d.rules,
  };
}
const wirePaths = (svg: string) => [...svg.matchAll(/<path d="(M[^"]*? L[^"]*)"/g)].map(m => {
  const n = [...m[1].matchAll(/-?\d+(?:\.\d+)?/g)].map(x => Math.round(Number(x[0]) * 2) / 2), out: string[] = [];
  for (let i = 0; i < n.length; i += 2) { const p = `${n[i]},${n[i + 1]}`; if (out.at(-1) !== p) out.push(p); }
  return out.join(' ');
}).sort();

/** V2 builds a template when its card is chosen (afTemplateMode off, the card pressed). */
async function v2Template(app: Awaited<ReturnType<typeof openApp>>, type: string, card: number) {
  await app.eval(([t, i]: [string, number]) => {
    const r = document.querySelector(`[name=projectType][value=${t}]`) as HTMLInputElement | null;
    if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    (window as unknown as { afTemplateMode: unknown }).afTemplateMode = null;
    for (const g of document.querySelectorAll('.af-template-choices')) g.querySelectorAll('.af-template-choice').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  }, [type, card]);
  await app.createProject(type);
  return { project: convertProject(await app.eval(() => projectData())), svg: await app.eval(() => exportSvgDocument(false).source) as string };
}

// [V3 template, V2 project type, V2 card (1 = variant 1, 2 = variant 0)]
const DIAGRAMS: [string, string, number][] = [['platform', 'function', 2], ['sensor', 'function', 1], ['power-car', 'power', 2], ['power-zones', 'power', 1]];
const PLANS: [string, number][] = [['product', 2], ['eco', 1]];

describe('example templates: valid in both languages', () => {
  it('every new template is valid V3 data, with its texts resolved', () => {
    for (const locale of ['zh-Hant', 'en'] as const) {
      setLocale(locale);
      for (const [id] of DIAGRAMS) {
        const { data, name } = functionDesign.create({ template: id });
        expect(validateData('function', data), id).toEqual([]);
        expect(JSON.stringify(data) + name, id).not.toContain('@i18n:');
        expect(name).toBe(data.texts[0].text);
        expect(data.view, id).toBe(id.startsWith('power-') ? 'power' : 'function');
      }
      for (const [id] of PLANS) {
        const { data, name } = scheduleDesign.create({ template: id });
        expect(validateData('schedule', data), id).toEqual([]);
        expect(JSON.stringify(data) + name, id).not.toContain('@i18n:');
      }
    }
  });
});

describe('golden: example templates vs V2.10.1', () => {
  const apps: { close(): Promise<void> }[] = [];
  afterAll(async () => { for (const a of apps) await a.close(); });
  for (const locale of ['zh-Hant', 'en'] as Locale[]) {
    for (const [id, type, card] of DIAGRAMS) {
      it(`${locale}: ${id} — same diagram${locale === 'zh-Hant' ? ' and exported wire routes' : ''} as V2`, async () => {
        const app = await openApp({ locale });
        apps.push(app);
        const v2 = await v2Template(app, type, card);
        const v2data = v2.project.designs[0].data as BlockDiagram;
        setLocale(locale);
        const made = functionDesign.create({ template: id });
        if (locale === 'zh-Hant') {
          expect(shape(made.data)).toEqual(shape(v2data));
          expect(wirePaths(exportSvg(made.data).source)).toEqual(wirePaths(v2.svg));
        } else {
          // one geometry for both languages (V2 grows auto-sized blocks to fit longer English text, 3.27c)
          const flat = (x: BlockDiagram) => ({ ...x, blocks: x.blocks.map(b => ({ ...b, w: 0, h: 0, ports: b.ports.map(p => ({ ...p, t: 0 })) })) });
          expect(shape(flat(made.data)).blocks.map(b => [b.title, b.partNumber, b.subtitle])).toEqual(shape(flat(v2data)).blocks.map(b => [b.title, b.partNumber, b.subtitle]));
          expect(shape(made.data).texts.map(x => x.text)).toEqual(shape(v2data).texts.map(x => x.text));
        }
      }, 60000);
    }
    for (const [id, card] of PLANS) {
      it(`${locale}: schedule ${id} — same tasks, dates (this week) and links as V2`, async () => {
        const app = await openApp({ locale });
        apps.push(app);
        const v2 = await v2Template(app, 'schedule', card);
        setLocale(locale);
        const made = scheduleDesign.create({ template: id });
        expect(scheduleShape(made.data)).toEqual(scheduleShape(v2.project.designs[0].data as ScheduleData));
      }, 60000);
    }
  }
});
