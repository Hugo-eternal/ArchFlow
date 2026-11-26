// module: model, render, shell — step 3.41b: align selected blocks (V2 uxAlign), arrange a
// block's pins by wiring (V2 afArrangeIO, compared with the V2 source itself), the diagram theme
// (V2 cleanTheme / fontStack) and the layout commands.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { setLocale } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import { alignBlocks, arrangePorts } from '../../src/model/arrange';
import { endPoint } from '../../src/core/grid';
import { cleanTheme, fontStack, DEFAULT_THEME, pxToPt, ptToPx } from '../../src/render/theme';
import { blocksLayer } from '../../src/render/blocks';
import { Shell as BaseShell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import type { BlockDiagram } from '../../src/io/schema-types';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }
beforeEach(() => setLocale('zh-Hant'));

/** Three blocks: A (centre) with 4 pins wired to B (above-right) and C (below-left). */
function diagram(): BlockDiagram {
  let d = m.emptyDiagram();
  d.grid.snap = false;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 300, y: 200 }), id: 'A', h: 160 }).data;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 700, y: 0 }), id: 'B' }).data;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 500 }), id: 'C' }).data;
  d.blocks.forEach(b => { b.ports = []; });
  const add = (block: string, type: string, side: 'l' | 'r' | 't' | 'b', t: number, id: string) => {
    d.blocks.find(b => b.id === block)!.ports.push({ id, name: id, side, t, type, label: 'inside', locked: false });
  };
  add('A', 'out', 'l', 0.2, 'a1'); add('A', 'out', 'r', 0.8, 'a2'); add('A', 'in', 'r', 0.3, 'a3'); add('A', 'io', 't', 0.5, 'a4');
  add('B', 'in', 'l', 0.5, 'b1'); add('C', 'out', 'r', 0.5, 'c1'); add('C', 'in', 'r', 0.2, 'c2');
  d = m.connect(d, { block: 'A', port: 'a1' }, { block: 'B', port: 'b1' }).data;
  d = m.connect(d, { block: 'C', port: 'c1' }, { block: 'A', port: 'a3' }).data;
  d = m.connect(d, { block: 'A', port: 'a2' }, { block: 'C', port: 'c2' }).data;
  d.wires[0].route = [{ x: 1, y: 1 }];
  return d;
}

/** V2 afArrangeIO run on the same data (source taken from legacy/app.zh-Hant.html). */
function v2Arrange(d: BlockDiagram, id: string): { id: string; side: string; t: number }[] {
  const html = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8');
  const start = html.indexOf('function afArrangeIO(');
  const src = html.slice(start, html.indexOf('\nafSpreadPorts=', start));
  const nodes = JSON.parse(JSON.stringify(d.blocks)).map((b: { ports: { locked: boolean; afLocked?: boolean }[] }) => ({ ...b, ports: b.ports.map(p => ({ ...p, afLocked: p.locked })) }));
  const model = { nodes, edges: d.wires.map(w => ({ a: { node: (w.a as { block: string }).block, port: (w.a as { port: string }).port }, b: { node: (w.b as { block: string }).block, port: (w.b as { port: string }).port } })) };
  const anchor = (r: { node: string; port: string }) => endPoint({ block: r.node, port: r.port }, d);
  const size = (n: { w: number; h: number }) => ({ w: n.w, h: n.h });
  const fn = new Function('model', 'anchor', 'size', 'afFunctionMode', `${src}; return afArrangeIO;`)(model, anchor, size, () => true);
  const n = model.nodes.find((x: { id: string }) => x.id === id);
  fn(n, true, 'LR');
  return n.ports.map((p: { id: string; side: string; t: number }) => ({ id: p.id, side: p.side, t: p.t }));
}

describe('arrangePorts (V2 afArrangeIO)', () => {
  it('matches V2 exactly: inputs left, outputs right, ordered by the other end, slots 0.06–0.94', () => {
    const d = diagram();
    const out = arrangePorts(d, 'A').blocks.find(b => b.id === 'A')!.ports.map(p => ({ id: p.id, side: p.side, t: p.t }));
    expect(out).toEqual(v2Arrange(d, 'A'));
    expect(out.find(p => p.id === 'a3')!.side).toBe('l');
    expect(out.find(p => p.id === 'a1')!.side).toBe('r');
    expect(out.find(p => p.id === 'a4')!.side).toBe('t');   // io stays where it is
  });

  it('keeps locked pins and matches V2 with them; drops manual routes of the block, input unchanged', () => {
    const d = diagram();
    d.blocks[0].ports[1].locked = true;
    const before = JSON.stringify(d);
    const r = arrangePorts(d, 'A');
    expect(JSON.stringify(d)).toBe(before);
    expect(r.blocks[0].ports[1]).toEqual(d.blocks[0].ports[1]);
    expect(r.blocks[0].ports.map(p => ({ id: p.id, side: p.side, t: p.t }))).toEqual(v2Arrange(d, 'A'));
    expect(r.wires[0].route).toBeUndefined();
  });
});

describe('alignBlocks (V2 uxAlign)', () => {
  it('centres on the first selected block; locked blocks are skipped; routes of moved blocks dropped', () => {
    const d = diagram();
    const r = alignBlocks(d, ['A', 'B', 'C'], 'horizontal')!;
    const cy = (id: string) => { const b = r.data.blocks.find(x => x.id === id)!; return b.y + b.h / 2; };
    expect(cy('B')).toBeCloseTo(cy('A'));
    expect(cy('C')).toBeCloseTo(cy('A'));
    expect(r.moved).toEqual(['B', 'C']);
    expect(r.data.wires[0].route).toBeUndefined();
    d.blocks[1].locked = true;
    const v = alignBlocks(d, ['B', 'A', 'C'], 'vertical')!;     // B locked: A is the reference
    const A = v.data.blocks[0], C = v.data.blocks[2];
    expect(C.x + C.w / 2).toBeCloseTo(A.x + A.w / 2);
    expect(v.data.blocks[1]).toEqual(d.blocks[1]);
    expect(alignBlocks(d, ['A', 'B'], 'vertical')).toBeNull();  // one movable block
  });
});

describe('theme (V2 cleanTheme / fontStack)', () => {
  it('cleans fonts and sizes, converts pt', () => {
    expect(cleanTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(cleanTheme({ latinFont: 'Comic Sans', cjkFont: 'PingFang TC', title: 100, subtitle: 1, label: 12, metric: Number.NaN }))
      .toEqual({ latinFont: 'Noto Sans', cjkFont: 'PingFang TC', title: 48, subtitle: 9, label: 12, metric: 14 });
    expect(pxToPt(DEFAULT_THEME.title)).toBe(20);
    expect(ptToPx(10.5)).toBe(14);
    expect(fontStack({ latinFont: 'Arial', cjkFont: 'Noto Sans TC' })).toMatch(/^"Arial", "Noto Sans TC", "Noto Sans CJK TC"/);
  });

  it('the blocks layer carries the theme font; none without a theme', () => {
    const d = diagram();
    expect(blocksLayer(d).attrs.style).toBeUndefined();
    expect(String(blocksLayer(d, { theme: cleanTheme({ latinFont: 'Arial' }) }).attrs.style)).toContain('--block-font: "Arial"');
  });
});

describe('layout commands', () => {
  it('align, arrange pins and the two dialogs are block-diagram commands, each edit one undo step', async () => {
    const s = new Shell();
    s.newProject('P', { type: 'function' });
    s.store.commit(diagram());
    expect(s.enabled('layout.alignHorizontal')).toBe(false);
    s.gestures.select([{ kind: 'block', id: 'A' }, { kind: 'block', id: 'B' }]);
    expect(s.enabled('layout.alignHorizontal')).toBe(true);
    expect(s.enabled('layout.arrangeSelectedPorts')).toBe(false);   // two blocks
    const steps = s.store.activeDesign!.history.undoDepth;
    await s.run('layout.alignHorizontal');
    expect(s.store.activeDesign!.history.undoDepth).toBe(steps + 1);
    expect(s.message?.key).toBe('align.done');
    s.gestures.select([{ kind: 'block', id: 'A' }]);
    await s.run('layout.arrangeSelectedPorts');
    expect(s.data().blocks[0].ports.find(p => p.id === 'a3')!.side).toBe('l');
    await s.run('design.manage');
    expect(s.dialog).toEqual({ kind: 'alignGrid' });
    await s.run('theme.fonts');
    expect(s.dialog).toEqual({ kind: 'fonts' });
    s.addDesign({ type: 'schedule' });
    for (const id of ['design.manage', 'theme.fonts', 'layout.alignHorizontal']) expect(s.enabled(id), id).toBe(false);
  });
});
