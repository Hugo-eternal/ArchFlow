// module: designs:function — parts library (designs/function/parts.ts): symbols, sizes, pins,
// supply values, voltage badges, the insert / turn commands and panel fields, and the symbols
// of the golden function design against the V2.10.1 export (same glyph placement and paths).
// Badge geometry is checked against values measured in V2.10.1 (see parts.ts header).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PARTS, GLYPH, makePart, reshapePart, setPartValue, normRail, cleanRails, railBand, partSize, sizesFor,
  badgesNode, partNode, decorationBounds, BADGE, isTwoPin,
} from '../../src/designs/function/parts';
import { functionDesign } from '../../src/designs/function';
import { Shell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import { exportSvg } from '../../src/export/svg';
import { find, toMarkup } from '../../src/render/vnode';
import { validateData } from '../../src/io/schema';
import * as m from '../../src/model/diagram';
import { setLocale, t } from '../../src/core/i18n';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const golden = (): BlockDiagram => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/function/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
const v2Export = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/function/__snapshots__/export.svg.json'), 'utf8')).elements as Record<string, string>[];

beforeEach(() => setLocale('zh-Hant'));

describe('parts', () => {
  it('every library part has a glyph, an i18n name and V2 sizes', () => {
    expect(PARTS.map(p => p.kind)).toEqual(['res', 'cap', 'capp', 'ind', 'bead', 'dio', 'led', 'tvs', 'fuse', 'xtal', 'vcc', 'gnd']);
    for (const p of PARTS) {
      expect(GLYPH[p.kind]).toBeTruthy();
      expect(t(p.label)).not.toBe(p.label);
    }
    expect(partSize('res', 'M', 0)).toEqual([100, 40]);
    expect(partSize('res', 'L', 90)).toEqual([60, 140]);
    expect(partSize('gnd', 'L', 0)).toEqual([60, 60]);
    expect(partSize('vcc', 'S', 0)).toEqual([60, 40]);
    expect(sizesFor('gnd')).toEqual(['M', 'L']);
  });

  it('makePart: two-pin parts get 1 / 2 (A / K for diodes), supply and ground one pin, labels hidden', () => {
    const r = makePart('res', { x: 100, y: 100 }, 'R');
    expect(r).toMatchObject({ x: 50, y: 80, w: 100, h: 40, ref: '', partNumber: '', part: { kind: 'res', rot: 0, size: 'M' } });
    expect(r.ports.map(p => `${p.name}:${p.side}:${p.label}`)).toEqual(['1:l:hidden', '2:r:hidden']);
    expect(makePart('led', { x: 0, y: 0 }, '').ports.map(p => p.name)).toEqual(['A', 'K']);
    expect(makePart('vcc', { x: 0, y: 0 }, '').ports).toMatchObject([{ name: '3.3V', side: 'b', type: 'power' }]);
    expect(makePart('gnd', { x: 0, y: 0 }, '').ports).toMatchObject([{ name: 'GND', side: 't', type: 'gnd' }]);
  });

  it('turning / resizing keeps the centre and the pin ids (wires stay attached); supply value renames its pin', () => {
    let d = m.emptyDiagram();
    d.grid.snap = false;
    const r = makePart('res', { x: 200, y: 200 }, 'R');
    d = m.addBlock(d, r).data;
    const ids = r.ports.map(p => p.id);
    d = reshapePart(d, r.id, { rot: 90 });
    const b = d.blocks[0];
    expect([b.x + b.w / 2, b.y + b.h / 2, b.w, b.h]).toEqual([200, 200, 40, 100]);
    expect(b.ports.map(p => `${p.id}:${p.side}`)).toEqual([`${ids[0]}:t`, `${ids[1]}:b`]);
    expect(reshapePart(d, r.id, { size: 'L' }).blocks[0]).toMatchObject({ w: 60, h: 140 });
    const v = makePart('vcc', { x: 0, y: 0 }, '');
    let d2 = m.addBlock(m.emptyDiagram(), v).data;
    d2 = setPartValue(d2, v.id, '5V');
    expect(d2.blocks[0].ports[0]).toMatchObject({ id: v.ports[0].id, name: '5V' });
    expect(reshapePart(d2, v.id, { rot: 90 }).blocks[0].part!.rot).toBe(0);   // only two-pin parts turn
    expect(validateData('function', d)).toEqual([]);
  });

  it('voltage text is normalised like V2 normRail; colour bands follow V2 railColor', () => {
    expect(['3v3', '+5', '05V', '1V8', ' 12 v ', '-5', 'VBAT'].map(normRail)).toEqual(['3.3V', '5V', '5V', '1.8V', '12V', '-5V', 'VBAT']);
    expect(cleanRails(['3v3', '3.3V', '', '1.8', '5', '12', '24'])).toEqual(['3.3V', '1.8V', '5V', '12V']);
    expect(['-5V', '1.2V', '1.8V', '3.3V', '5V', '12V', 'VBAT'].map(railBand)).toEqual(['negative', 'core', 'io', 'logic', 'mid', 'high', 'unknown']);
  });
});

describe('drawing', () => {
  it('badges: right-aligned 13 px inside the block, top 9 px above it, 22 px high, 4 px apart (V2 measured)', () => {
    const b = { ...m.makeBlock(m.emptyDiagram(), { x: 380, y: 180 }), w: 260, h: 160, rails: ['3.3V', '1.8V', '-5V'] };
    const measure = (s: string) => ({ '3.3V': 25.5, '1.8V': 25.5, '-5V': 18.95 } as Record<string, number>)[s];
    const g = badgesNode(b, measure)!;
    const pills = find(g, n => n.attrs.class === 'af-rail-pill');
    // V2.10.1 (pill outer boxes): x 453.05 / 514.55 / 576.05, widths 57.5 / 57.5 / 50.95, y 171, h 22
    const outer = pills.map(p => [Number(p.attrs.x) - 0.5, Number(p.attrs.width) + 1, Number(p.attrs.y) - 0.5, Number(p.attrs.height) + 1]);
    expect(outer.map(o => o.map(v => Math.round(v * 100) / 100))).toEqual([[453.05, 57.5, 171, 22], [514.55, 57.5, 171, 22], [576.05, 50.95, 171, 22]]);
    expect(find(g, n => n.attrs.class === 'af-rail-text').map(n => n.text)).toEqual(['3.3V', '1.8V', '-5V']);
    expect(BADGE.height).toBe(22);
    expect(badgesNode({ ...b, part: { kind: 'res', rot: 0, size: 'M' } })).toBeNull();
  });

  it('supply label: centred, bottom 14 px below the top, coloured by voltage (V2 measured 1467.25 + 25.5 / 2 = x + w / 2)', () => {
    const v = { ...makePart('vcc', { x: 1480, y: 230 }, ''), partNumber: '3.3V' };
    const label = find(partNode(v)!, n => n.tag === 'text')[0];
    expect(label.attrs).toMatchObject({ x: 1480, 'text-anchor': 'middle', class: 'af-part-value af-rail-logic' });
    expect(Number(label.attrs.y)).toBeCloseTo(v.y + 14 - 7.2, 5);
    expect(partNode({ ...makePart('gnd', { x: 0, y: 0 }, ''), partNumber: 'x' })!.children.filter(Boolean)).toHaveLength(1);
    expect(decorationBounds({ ...makePart('res', { x: 0, y: 0 }, ''), partNumber: '10kΩ' })).toHaveLength(1);
  });

  it('golden: the symbols are where V2.10.1 exported them, with the same paths', () => {
    const d = golden();
    const svg = exportSvg(d, { decorate: functionDesign.decorate! });
    expect(svg.source).not.toContain('class=');
    const v2 = v2Export();
    const v2glyphs = v2.flatMap((e, i) => (e.tag === 'g' && /scale/.test(e.transform ?? '') && e.stroke === 'rgb(42, 58, 75)'
      ? [{ transform: e.transform, paths: v2.slice(i + 1).filter((x, j, all) => all.slice(0, j + 1).every(y => Number(y.depth) > Number(e.depth))).map(x => x.d).filter(Boolean) }] : []));
    for (const b of d.blocks.filter(x => x.part && x.part.kind !== 'conn')) {
      const want = v2glyphs.find(g => g.transform === `translate(${b.x},${b.y}) scale(1,1)`);
      expect(want, `V2 glyph for ${b.part!.kind}`).toBeTruthy();
      const node = partNode(b)!;
      const glyph = find(node, n => n.attrs.class === 'af-part-glyph')[0];
      expect(glyph.attrs.transform).toBe(`translate(${b.x},${b.y}) scale(1,1)`);
      const mine = find(glyph, n => n.tag === 'path').map(n => String(n.attrs.d));
      const round = (s: string) => s.replace(/-?\d+(?:\.\d+)?/g, x => String(Math.round(Number(x) * 2) / 2));
      expect(mine.map(round)).toEqual(want!.paths.filter(p => p.startsWith('M')).map(round));
      expect(toMarkup(glyph)).toContain('stroke-width="1.8"');
    }
  });
});

describe('module: panel fields and commands', () => {
  it('a part shows value / size / direction; a plain block shows voltage badges', () => {
    const d = golden();
    const res = d.blocks.find(b => b.part?.kind === 'res')!, gnd = d.blocks.find(b => b.part?.kind === 'gnd')!, plain = d.blocks.find(b => !b.part && !b.connector)!;
    const keys = (id: string) => functionDesign.inspectorFields!({ kind: 'block', id }, d).map(f => f.key);
    expect(keys(res.id)).toEqual(['partValue', 'partSize', 'partRot']);
    expect(keys(gnd.id)).toEqual(['partSize']);
    expect(keys(plain.id)).toEqual(['rails']);
    const rails = functionDesign.inspectorFields!({ kind: 'block', id: plain.id }, d)[0];
    if (rails.kind !== 'text') throw new Error('text field expected');
    const out = rails.set(d, { kind: 'block', id: plain.id }, '3v3, 1.8');
    expect(out.blocks.find(b => b.id === plain.id)!.rails).toEqual(['3.3V', '1.8V']);
    expect(rails.validate!('1,2,3,4,5', d, { kind: 'block', id: plain.id })).toBe('part.field.railsTooMany');
  });

  it('insert commands place parts in free space (not on blocks or wires), one undo step each; R turns a part', async () => {
    const s = new Shell(createRegistry());
    s.newProject('P', { type: 'function', template: 'starter' });
    s.setViewport({ w: 1200, h: 800 });
    s.fitView();
    for (const p of PARTS) await s.run(`part.insert.${p.kind}`);
    const d = s.data();
    const parts = d.blocks.filter(b => b.part);
    expect(parts).toHaveLength(PARTS.length);
    const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const p of parts) for (const q of d.blocks) if (p !== q) expect(overlap(p, q), `${p.part!.kind} vs ${q.title}`).toBe(false);
    expect(parts.map(p => p.title)).toEqual(PARTS.map(p => t(p.label)));
    // the template's wires keep their routes (nothing was placed on them)
    expect([...s.routesFor(d).values()].every(r => r.valid)).toBe(true);
    const res = parts[0];
    s.gestures.select([{ kind: 'block', id: res.id }]);
    expect(s.enabled('part.rotate')).toBe(true);
    await s.run('part.rotate');
    expect(s.data().blocks.find(b => b.id === res.id)!.part!.rot).toBe(90);
    s.store.undo();
    s.store.undo();
    expect(s.data().blocks.filter(b => b.part)).toHaveLength(PARTS.length - 1);
    s.gestures.select([{ kind: 'block', id: d.blocks[0].id }]);
    expect(s.enabled('part.rotate')).toBe(false);
    expect(isTwoPin('vcc')).toBe(false);
  });
});
