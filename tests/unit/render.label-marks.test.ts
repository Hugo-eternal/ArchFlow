// module: render, model, inspector, core — step 3.43d2: wire label marks (V2 v4 afLabelMark: drag,
// angle, reset), label de-duplication against pin names (V2 dedupeLabels L3099) and new blocks
// following the diagram (V2 adopt L3097).
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/core/i18n';
import * as m from '../../src/model/diagram';
import { setLabelMark } from '../../src/model/route-edit';
import { wiresLayer } from '../../src/render/wires';
import { find } from '../../src/render/vnode';
import { routeAll } from '../../src/router/full-path';
import { wireFields } from '../../src/inspector/common';
import { fieldKeys } from '../../src/inspector/panel';
import { Store } from '../../src/core/store';
import { Gestures } from '../../src/interaction/gestures';
import type { BlockDiagram } from '../../src/io/schema-types';

beforeEach(() => setLocale('zh-Hant'));

function pair(name = 'SDA', pin = 'O', bx = 400): BlockDiagram {
  let d = m.emptyDiagram();
  d.grid.snap = false;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A', w: 120, h: 100, ports: [] }).data;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: bx, y: 0 }), id: 'B', w: 120, h: 100, ports: [] }).data;
  d.blocks[0].ports.push({ id: 'o', name: pin, side: 'r', t: 0.5, type: 'out', label: 'outside', locked: false });
  d.blocks[1].ports.push({ id: 'i', name: 'I', side: 'l', t: 0.5, type: 'in', label: 'inside', locked: false });
  return m.connect(d, { block: 'A', port: 'o' }, { block: 'B', port: 'i' }, { name }).data;
}
const labels = (d: BlockDiagram) => find(wiresLayer(d, routeAll(d)), n => String(n.attrs.class) === 'af-wire-label');

describe('label marks', () => {
  it('a mark places and turns the label; angles kept in 0–359; null gives it back', () => {
    const p = pair();
    const d = setLabelMark(p, p.wires[0].id, { x: 10, y: 20, angle: -90 });
    expect(d.wires[0].label?.mark).toEqual({ x: 10, y: 20, angle: 270 });
    const l = labels(d)[0];
    expect(l.attrs).toMatchObject({ x: 10, y: 20, 'text-anchor': 'middle', transform: 'rotate(270 10 20)' });
    expect(setLabelMark(d, d.wires[0].id, null).wires[0].label?.mark).toBeUndefined();
  });

  it('the inspector shows the mark group for a labelled wire', () => {
    const d = pair();
    const keys = fieldKeys(wireFields(), d, { kind: 'wire', id: d.wires[0].id });
    for (const k of ['markX', 'markY', 'markAngle']) expect(keys).toContain(k);
    const f = wireFields().flatMap(x => (x.kind === 'group' ? x.fields : [x])).find(x => x.key === 'markAngle')!;
    if (f.kind !== 'number') throw new Error('kind');
    const e = f.set(d, { kind: 'wire', id: d.wires[0].id }, 90);
    expect(e.wires[0].label?.mark?.angle).toBe(90);
  });

  it('drag a label: a mark, one undo step; a click only selects the wire', () => {
    const store = new Store();
    store.newProject('P', { type: 'function', name: 'D', data: pair() });
    const data = () => store.data(store.activeDesignId) as BlockDiagram;
    const g = new Gestures({ store, camera: () => ({ x: 0, y: 0, z: 1 }), setCamera: () => {}, routes: () => routeAll(data()) });
    const l = labels(data())[0].attrs as { x: number; y: number };
    const at = (x: number, y: number) => ({ x, y, button: 0, shift: false } as never);
    g.down(at(l.x, l.y - 4)); g.up(at(l.x, l.y - 4));
    expect(g.selection).toEqual([{ kind: 'wire', id: data().wires[0].id }]);
    expect(data().wires[0].label?.mark).toBeUndefined();
    g.down(at(l.x, l.y - 4)); g.move(at(l.x + 30, l.y + 26)); g.up(at(l.x + 30, l.y + 26));
    expect(data().wires[0].label?.mark).toEqual({ x: l.x + 30, y: l.y + 30, angle: 0 });
    store.undo();
    expect(data().wires[0].label?.mark).toBeUndefined();
  });
});

describe('dedupe (V2 L3099)', () => {
  it('a label equal to a pin name drawn next to it is hidden; otherwise shown', () => {
    // a short wire: its label sits next to A's outside pin name
    expect(labels(pair('SDA', 'O', 180))).toHaveLength(1);
    expect(labels(pair('O', 'O', 180))).toHaveLength(0);
    expect(labels(pair('o ', 'O', 180))).toHaveLength(0);      // case and spaces ignored
    expect(labels(pair('O', 'O', 400))).toHaveLength(1);       // far from the pin name
    const near = pair('O', 'O', 180);
    expect(labels(setLabelMark(near, near.wires[0].id, { x: 900, y: 900, angle: 0 }))).toHaveLength(1);
  });
});

describe('adopt (V2 L3097)', () => {
  it('a new block keeps its reference only when most blocks have one; name position follows the majority', () => {
    let d = m.emptyDiagram();
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A', ref: '', titleAlign: 'top-left' }).data;
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 300, y: 0 }), id: 'B', ref: '', titleAlign: 'top-left' }).data;
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 600, y: 0 }), id: 'N', ref: 'U3' }).data;
    const a = m.adoptNewBlock(d, 'N').blocks[2];
    expect(a.ref).toBe('');
    expect(a.titleAlign).toBe('top-left');
    d.blocks[0].ref = 'U1'; d.blocks[1].ref = 'U2'; d.blocks[1].titleAlign = 'center-left';
    const b = m.adoptNewBlock(d, 'N').blocks[2];
    expect(b.ref).toBe('U3');
    expect(b.titleAlign).toBeUndefined();                   // no majority: centred
  });
});
