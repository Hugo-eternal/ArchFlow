// module: model, router, core — step 3.43d: editing a wire's path by hand (V2 grid segment drag
// L1552, rc48 corner handles L2117, Shift-drag a pin along the block edge), through the gestures.
import { describe, it, expect } from 'vitest';
import * as m from '../../src/model/diagram';
import { moveCorner, moveSegment, setManualPath, slidePort } from '../../src/model/route-edit';
import { routeAll, routeWire } from '../../src/router/full-path';
import { Store } from '../../src/core/store';
import { Gestures } from '../../src/interaction/gestures';
import type { BlockDiagram } from '../../src/io/schema-types';

const P = (x: number, y: number) => ({ x, y });

describe('path edits', () => {
  it('moveSegment: an interior segment moves across itself; end segments get a jog out of the pin', () => {
    const ps = [P(0, 0), P(100, 0), P(100, 100), P(200, 100)];
    expect(moveSegment(ps, 1, 30)).toEqual([P(0, 0), P(130, 0), P(130, 100), P(200, 100)]);
    expect(moveSegment([P(0, 0), P(200, 0)], 0, 40, 20)).toEqual([P(0, 0), P(20, 0), P(20, 40), P(180, 40), P(180, 0), P(200, 0)]);
    expect(moveSegment(ps, 0, 10, 20)).toEqual([P(0, 0), P(20, 0), P(20, 10), P(100, 10), P(100, 100), P(200, 100)]);
    expect(moveSegment([P(0, 0), P(10, 10)], 0, 5)).toBeNull();
  });

  it('moveCorner: the two segments follow (V2 cornerPath)', () => {
    const ps = [P(0, 0), P(100, 0), P(100, 100)];
    expect(moveCorner(ps, 1, P(60, 40))).toEqual([P(0, 0), P(60, 0), P(60, 40), P(100, 40), P(100, 100)]);
    expect(moveCorner(ps, 0, P(1, 1))).toBeNull();
  });
});

/** Two blocks side by side, a wire A.out → B.in, grid off. */
function pair(): BlockDiagram {
  let d = m.emptyDiagram();
  d.grid.snap = false;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A', w: 120, h: 100, ports: [] }).data;
  d = m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'B', w: 120, h: 100, ports: [] }).data;
  d.blocks[0].ports.push({ id: 'o', name: 'O', side: 'r', t: 0.5, type: 'out', label: 'inside', locked: false });
  d.blocks[1].ports.push({ id: 'i', name: 'I', side: 'l', t: 0.5, type: 'in', label: 'inside', locked: false });
  return m.connect(d, { block: 'A', port: 'o' }, { block: 'B', port: 'i' }, { name: 'W' }).data;
}

describe('stored path and pin slide', () => {
  it('a hand-edited complete path is routed as is', () => {
    const d = pair(), w = d.wires[0];
    const ps = routeAll(d).get(w.id)!.ps;
    const next = moveSegment(ps, 0, 30, 20)!;
    const e = setManualPath(d, w.id, next);
    expect(e.wires[0]).toMatchObject({ routing: 'manual' });
    const r = routeWire(e.wires[0], e);
    expect(r.valid).toBe(true);
    expect(r.ps).toEqual(next);
  });

  it('slidePort: nearest side, grid step, the wire loses its manual route', () => {
    let d = pair();
    d = setManualPath(d, d.wires[0].id, routeAll(d).get(d.wires[0].id)!.ps);
    const e = slidePort(d, 'A', 'o', P(60, 104), 10);
    expect(e.blocks[0].ports[0]).toMatchObject({ side: 'b', t: 0.5 });
    expect(e.wires[0].route).toBeUndefined();
  });
});

describe('gestures', () => {
  const setup = () => {
    const store = new Store();
    store.newProject('P', { type: 'function', name: 'D', data: pair() });
    const data = () => store.data(store.activeDesignId) as BlockDiagram;
    const g = new Gestures({ store, camera: () => ({ x: 0, y: 0, z: 1 }), setCamera: () => {}, routes: () => routeAll(data()) });
    return { store, data, g };
  };
  const at = (x: number, y: number, shift = false) => ({ x, y, button: 0, shift } as never);

  it('drag the middle handle of a straight wire: a jog, one undo step', () => {
    const { store, data, g } = setup();
    const w = data().wires[0];
    g.select([{ kind: 'wire', id: w.id }]);
    const mid = g.wireHandles(w.id).segments[0];
    g.down(at(mid.x, mid.y));
    g.move(at(mid.x, mid.y + 40));
    g.up(at(mid.x, mid.y + 40));
    const r = routeAll(data()).get(w.id)!;
    expect(r.valid).toBe(true);
    expect(Math.max(...r.ps.map(p => p.y))).toBe(mid.y + 40);
    store.undo();
    expect(data().wires[0].route).toBeUndefined();
  });

  it('a path through a block is refused: red preview, nothing changes', () => {
    const { store, data, g } = setup();
    store.commit(m.addBlock(data(), { ...m.makeBlock(data(), { x: 200, y: 120 }), id: 'C', w: 100, h: 80, ports: [] }).data);
    let refused = 0;
    (g as unknown as { host: { refused: () => void } }).host.refused = () => { refused++; };
    const w = data().wires[0];
    g.select([{ kind: 'wire', id: w.id }]);
    const mid = g.wireHandles(w.id).segments[0];
    const before = JSON.stringify(data());
    g.down(at(mid.x, mid.y));
    g.move(at(mid.x, mid.y + 110));                     // y = 160: through C
    expect(g.preview?.kind).toBe('invalidPath');
    g.up(at(mid.x, mid.y + 110));
    expect(refused).toBe(1);
    expect(JSON.stringify(data())).toBe(before);
  });

  it('Shift-drag a pin moves it along the edge (one undo step)', () => {
    const { store, data, g } = setup();
    g.down(at(120, 50, true));
    g.move(at(80, 100, true));
    g.up(at(80, 100, true));
    expect(data().blocks[0].ports[0].side).toBe('b');
    store.undo();
    expect(data().blocks[0].ports[0].side).toBe('r');
  });
});
