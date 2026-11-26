// module: model, render, inspector, core — step 3.43c: block size and text (V2.7 per-block
// font sizes, V2.9 free size / no main name, V2.10 text scales with the block), pin labels at the
// diagram's label size.
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import { blocksLayer } from '../../src/render/blocks';
import { find } from '../../src/render/vnode';
import { blockFields } from '../../src/inspector/common';
import { fieldKeys } from '../../src/inspector/panel';
import { Store } from '../../src/core/store';
import { Gestures } from '../../src/interaction/gestures';
import type { BlockDiagram } from '../../src/io/schema-types';

beforeEach(() => setLocale('zh-Hant'));

function one(free = false, snap = false): BlockDiagram {
  let d = m.emptyDiagram();
  d.grid.snap = snap;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A', w: 200, h: 100, sizing: free ? 'free' : 'auto' }).data;
  return d;
}

describe('resizeBlock', () => {
  it('normal blocks: steps of 10, at least 120 × 60; free blocks: per pixel, at least 20; grid: the grid step', () => {
    expect(m.resizeBlock(one(), 'A', 333, 41).blocks[0]).toMatchObject({ w: 330, h: 60 });
    expect(m.resizeBlock(one(true), 'A', 33.4, 5).blocks[0]).toMatchObject({ w: 33, h: 20 });
    expect(m.resizeBlock(one(false, true), 'A', 333, 41).blocks[0]).toMatchObject({ w: 330, h: 60 });
    const g20 = one(true, true); g20.grid.size = 20;
    expect(m.resizeBlock(g20, 'A', 55, 5).blocks[0]).toMatchObject({ w: 60, h: 40 });
  });

  it('scaleText: title and fonts by the smaller ratio, from the theme, clamped (V2.10)', () => {
    const d = m.resizeBlock(one(), 'A', 300, 150, { scaleText: true, theme: { title: 20, subtitle: 13, label: 13, metric: 13 } });
    const b = d.blocks[0];
    expect(b.style.titleSize).toBeCloseTo(40);              // the block's own 26.67 × 1.5
    expect(b.font).toEqual({ subtitle: 19.5, label: 19.5, metric: 19.5 });
    const small = m.resizeBlock(one(), 'A', 120, 60, { scaleText: true }).blocks[0];
    expect(small.style.titleSize).toBeCloseTo(16);                // 26.67 × 0.6
    expect(small.font!.label).toBe(8);                            // 11 × 0.6 → at least 8
    expect(m.resizeBlock(one(), 'A', 202, 100, { scaleText: true }).blocks[0].font).toBeUndefined();   // under 2 %
    expect(m.resizeBlock(one(), 'A', 300, 150).blocks[0].font).toBeUndefined();
  });

  it('apply fonts to all ordinary blocks; scale every block font', () => {
    let d = one();
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'B' }).data;
    d = m.updateBlock(d, 'A', { font: { label: 15 }, style: { titleSize: 30 } });
    const all = m.applyFontsToAll(d, 'A');
    expect(all.blocks[1].font).toEqual({ label: 15 });
    expect(all.blocks[1].style.titleSize).toBe(30);
    const scaled = m.scaleBlockFonts(all, 2);
    expect(scaled.blocks[1]).toMatchObject({ font: { label: 30 }, style: { titleSize: 48 } });
  });
});

describe('render and inspector', () => {
  it('pin labels use the block font, else the theme label size; the grip only on the resizable block', () => {
    let d = one();
    d = m.addPort(d, 'A', 'in').data;
    d.blocks[0].ports[0].name = 'IN';
    const size = (x: BlockDiagram, theme?: BlockDiagram['theme']) => find(blocksLayer(x, { theme }), n => String(n.attrs.class) === 'af-port-label')[0].attrs.style;
    expect(size(d)).toBeUndefined();
    expect(size(d, { latinFont: 'Arial', cjkFont: 'PingFang TC', title: 20, subtitle: 13, label: 13, metric: 13 })).toBe('font-size:13px');
    d.blocks[0].font = { label: 16 };
    expect(size(d)).toBe('font-size:16px');
    expect(find(blocksLayer(d, { resizable: 'A' }), n => String(n.attrs.class) === 'af-block-handle')).toHaveLength(1);
    expect(find(blocksLayer(d), n => String(n.attrs.class) === 'af-block-handle')).toHaveLength(0);
  });

  it('the size group: show name, free size, W / H, fonts; hidden for parts', () => {
    const d = one();
    const keys = fieldKeys(blockFields(), d, { kind: 'block', id: 'A' });
    for (const k of ['showTitle', 'free', 'w', 'h', 'titleSize', 'font-subtitle', 'font-label', 'font-metric']) expect(keys).toContain(k);
    const group = blockFields().find(f => f.key === 'size')!;
    expect(group.visible!(d, { kind: 'block', id: 'A' })).toBe(true);
    d.blocks[0].part = { kind: 'res', rot: 0, size: 'M' };
    expect(group.visible!(d, { kind: 'block', id: 'A' })).toBe(false);
  });
});

describe('resize gesture', () => {
  it('drag the selected block corner: one undo step; text scales when the preference is on', () => {
    const store = new Store();
    store.newProject('P', { type: 'function', name: 'D', data: one() });
    let scale = true;
    const g = new Gestures({ store, camera: () => ({ x: 0, y: 0, z: 1 }), setCamera: () => {}, routes: () => new Map(), scaleText: () => scale });
    g.select([{ kind: 'block', id: 'A' }]);
    g.down({ x: 200, y: 100, button: 0, shift: false } as never);
    g.move({ x: 300, y: 150, button: 0, shift: false } as never);
    expect(g.draft().blocks[0]).toMatchObject({ w: 300, h: 150 });
    g.up({ x: 300, y: 150, button: 0, shift: false } as never);
    const b = (store.data(store.activeDesignId) as BlockDiagram).blocks[0];
    expect(b).toMatchObject({ w: 300, h: 150 });
    expect(b.style.titleSize).toBeCloseTo(40);
    expect(b.font!.label).toBeCloseTo(16.5);
    store.undo();
    expect((store.data(store.activeDesignId) as BlockDiagram).blocks[0]).toMatchObject({ w: 200, h: 100 });
    scale = false;
    g.down({ x: 200, y: 100, button: 0, shift: false } as never);
    g.move({ x: 260, y: 100, button: 0, shift: false } as never);
    g.up({ x: 260, y: 100, button: 0, shift: false } as never);
    const c = (store.data(store.activeDesignId) as BlockDiagram).blocks[0];
    expect(c.w).toBe(260);
    expect(c.font).toBeUndefined();
  });
});
