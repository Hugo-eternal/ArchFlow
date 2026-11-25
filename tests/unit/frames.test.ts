// module: render — area frames shared by block diagrams: model (members, fit, limits),
// drawing (render/frames) against the V2.10.1 golden export, hit testing on the name tab, and
// the gestures that move a frame with its contents and resize it from a corner.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as m from '../../src/model/diagram';
import { frameTab, framesLayer, FRAME_TAB } from '../../src/render/frames';
import { find } from '../../src/render/vnode';
import { hitTest } from '../../src/interaction/hit';
import { Gestures, type GestureHost } from '../../src/interaction/gestures';
import { exportSvg } from '../../src/export/svg';
import { Store } from '../../src/core/store';
import { frameFields } from '../../src/inspector/common';
import type { BlockDiagram, Camera } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const golden = (): BlockDiagram => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/function/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
const v2Export = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/function/__snapshots__/export.svg.json'), 'utf8')).elements as Record<string, string>[];

function diagram() {
  let d = m.emptyDiagram();
  d.grid.snap = false;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 100, y: 100 }), id: 'IN' }).data;    // centre inside
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 700, y: 100 }), id: 'OUT' }).data;   // outside
  d = m.addText(d, { x: 120, y: 260 }, 'note').data;
  const f = m.addFrame(d, { x: 50, y: 50, w: 400, h: 300 }, 'Area'); d = f.data;
  const inner = m.addFrame(d, { x: 80, y: 240, w: 200, h: 100 }, 'Inner'); d = inner.data;
  return { d, frame: f.id, inner: inner.id };
}

describe('model', () => {
  it('members: blocks / texts by centre, junctions inside, frames entirely inside', () => {
    const { d, frame, inner } = diagram();
    expect(m.frameMembers(d, frame).sort()).toEqual(['IN', d.texts[0].id, inner].sort());
    expect(m.frameMembers(d, 'nope')).toEqual([]);
  });

  it('limits 120 × 80, title 80 characters, default dashed teal; fit = contents + 30 px (V2)', () => {
    const { d, frame } = diagram();
    expect(m.updateFrame(d, frame, { w: 10, h: 10, title: 'x'.repeat(100) }).frames[0]).toMatchObject({ w: 120, h: 80 });
    expect(m.updateFrame(d, frame, { title: 'x'.repeat(100) }).frames[0].title).toHaveLength(80);
    expect(d.frames[0]).toMatchObject({ style: 'dash', color: 'teal' });
    const fit = m.fitFrame(d, frame)!.frames[0];
    // contents: block IN (100,100 200×100), text (120,260 w180 → h24), inner frame (80,240 200×100)
    expect(fit).toMatchObject({ x: 50, y: 60, w: 280, h: 310 });
    const empty = m.addFrame(m.emptyDiagram(), { x: 0, y: 0, w: 200, h: 200 });
    expect(m.fitFrame(empty.data, empty.id)).toBeNull();
  });
});

describe('drawing', () => {
  it('golden: outline, tab and name where V2.10.1 exported them', () => {
    const d = golden(), f = d.frames[0];
    const v2 = v2Export().filter(e => e.tag === 'rect' || e.tag === 'text');
    const box = v2.find(e => e.rx === '10')!, tab = v2.find(e => e.rx === '6')!, name = v2.find(e => e.text === f.title)!;
    const g = framesLayer(d.frames);
    const mine = (cls: string) => find(g, n => n.attrs.class === cls)[0].attrs;
    expect(mine('af-frame-box')).toMatchObject({ x: Number(box.x), y: Number(box.y), width: Number(box.width), height: Number(box.height), rx: 10 });
    const t = mine('af-frame-tab');
    expect([t.x, t.y, t.height]).toEqual([Number(tab.x), Number(tab.y), Number(tab.height)]);
    expect(Math.abs(Number(t.width) - Number(tab.width))).toBeLessThan(12);     // text width is estimated
    expect(Number(mine('af-frame-name').x)).toBe(Number(name.x));
    // in the export: the colours V2 used, behind everything
    const src = exportSvg(d).source;
    expect(src).toMatch(/<rect x="230" y="-70" width="800" height="480" rx="10" fill="none" stroke-width="1.5" stroke-dasharray="7 5" stroke="#4A9C90">/);
    expect(src.indexOf('stroke-dasharray="7 5"')).toBeLessThan(src.indexOf('<path d="M', src.indexOf('</defs>')));
  });

  it('handles only on the selected frame; the tab is narrower than the frame', () => {
    const { d, frame } = diagram();
    expect(find(framesLayer(d.frames), n => n.attrs.class === 'af-frame-handle')).toHaveLength(0);
    expect(find(framesLayer(d.frames, { selected: new Set([frame]) }), n => n.attrs.class === 'af-frame-handle')).toHaveLength(4);
    const long = { ...d.frames[0], title: 'x'.repeat(80) };
    expect(frameTab(long).w).toBeLessThanOrEqual(long.w - 2 * FRAME_TAB.left);
  });

  it('the tab picks the frame; the inside does not', () => {
    const { d, frame } = diagram();
    const tab = frameTab(d.frames[0]);
    expect(hitTest(d, { x: tab.x + 5, y: tab.y + 3 }, { zoom: 1, routes: new Map() })).toEqual({ kind: 'frame', id: frame });
    expect(hitTest(d, { x: 400, y: 320 }, { zoom: 1, routes: new Map() })).toBeNull();
  });

  it('inspector fields: name, style, colour, size, fit', () => {
    expect(frameFields().map(f => f.key)).toEqual(['title', 'style', 'color', 'w', 'h', 'fit']);
  });
});

describe('gestures', () => {
  function host(d: BlockDiagram) {
    const store = new Store();
    store.newProject('P', { type: 'function', name: 'D', data: d });
    let camera: Camera = { x: 0, y: 0, z: 1 };
    const h: GestureHost = { store, camera: () => camera, setCamera: c => { camera = c; }, routes: () => new Map(), flavour: () => 'function' };
    return { store, g: new Gestures(h), data: () => store.data(store.activeDesignId) as BlockDiagram };
  }

  it('dragging a frame moves what is inside it (one undo step)', () => {
    const { d, frame, inner } = diagram();
    const { g, data, store } = host(d);
    const tab = frameTab(d.frames[0]);
    g.down({ x: tab.x + 5, y: tab.y + 5 });
    g.move({ x: tab.x + 55, y: tab.y + 25 });
    g.up({ x: tab.x + 55, y: tab.y + 25 });
    const after = data();
    expect(after.frames.find(f => f.id === frame)).toMatchObject({ x: 100, y: 70 });
    expect(after.frames.find(f => f.id === inner)).toMatchObject({ x: 130, y: 260 });
    expect(after.blocks.find(b => b.id === 'IN')).toMatchObject({ x: 150, y: 120 });
    expect(after.blocks.find(b => b.id === 'OUT')).toMatchObject({ x: 700, y: 100 });
    expect(after.texts[0]).toMatchObject({ x: 170, y: 280 });
    store.undo();
    expect(data().blocks.find(b => b.id === 'IN')).toMatchObject({ x: 100, y: 100 });
  });

  it('a corner of the selected frame resizes it; the minimum size holds', () => {
    const { d, frame } = diagram();
    const { g, data } = host(d);
    g.select([{ kind: 'frame', id: frame }]);
    g.down({ x: 450, y: 350 });                // south-east corner
    g.move({ x: 520, y: 400 });
    g.up({ x: 520, y: 400 });
    expect(data().frames[0]).toMatchObject({ x: 50, y: 50, w: 470, h: 350 });
    g.down({ x: 50, y: 50 });                  // north-west corner, far past the other side
    g.move({ x: 900, y: 900 });
    g.up({ x: 900, y: 900 });
    expect(data().frames[0]).toMatchObject({ w: 120, h: 80, x: 400, y: 320 });
    expect(data().blocks.find(b => b.id === 'IN')).toMatchObject({ x: 100, y: 100 });   // resizing moves nothing else
  });
});
