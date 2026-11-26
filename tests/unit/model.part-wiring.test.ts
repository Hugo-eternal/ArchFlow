// module: model, core, designs:function — step 3.43e: wiring a part quickly (V2 af15-ux2 finish
// L4209): a lead dropped on a block's body adds a pin there; on a part's body takes its free lead;
// a lead dropped on a wire splits it with a junction.
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/core/i18n';
import { endPoint } from '../../src/core/grid';
import { Shell as BaseShell } from '../../src/shell/controller';
import { createRegistry } from '../../src/app';
import { connectToBody, freeLead, nearestWirePoint, tapWire } from '../../src/model/part-wiring';
import { routeAll } from '../../src/router/full-path';
import * as m from '../../src/model/diagram';

class Shell extends BaseShell { constructor() { super(createRegistry()); } }
beforeEach(() => setLocale('zh-Hant'));

/** A blank diagram (grid off) with one block "IC" at (400, 0) and the given part placed at (100, 200). */
async function setup(part: string) {
  const s = new Shell();
  s.newProject('P', { type: 'function' });
  s.edit(d => ({ ...d, grid: { ...d.grid, snap: false } }));
  s.edit(d => m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'IC', w: 200, h: 120, ports: [] }).data);
  await s.run(`part.insert.${part}`);
  const p = s.data().blocks.find(b => b.part)!;
  s.edit(d => m.moveItems(d, [p.id], 100 - p.x, 200 - p.y));
  return { s, part: s.data().blocks.find(b => b.part)! };
}
const at = (x: number, y: number) => ({ x, y, button: 0, shift: false } as never);

describe('connectToBody / freeLead', () => {
  it('a supply symbol dropped on a block adds a hidden "VCC"-like power pin on the nearest edge, power wire', async () => {
    const { s, part } = await setup('vcc');
    const r = connectToBody(s.data(), { block: part.id, port: part.ports[0].id }, 'IC', { x: 402, y: 60 })!;
    const ic = r.data.blocks.find(b => b.id === 'IC')!, pin = ic.ports.find(p => p.id === r.addedPort)!;
    expect(pin).toMatchObject({ side: 'l', type: 'power', label: 'hidden', t: 0.5 });
    expect(pin.name).toBe(part.partNumber || 'VCC');
    expect(r.data.wires.find(w => w.id === r.wire)).toMatchObject({ kind: 'power', line: { arrow: false } });
  });

  it('a part body gives its unused lead first, else the nearest; ordinary blocks on both ends are not handled', async () => {
    const { s, part } = await setup('res');
    const [l0, l1] = part.ports.map(p => p.id);
    const near0 = endPoint({ block: part.id, port: l0 }, s.data());
    expect(freeLead(s.data(), part, near0)).toBe(l0);
    const x = m.addPort(s.data(), 'IC', 'in');
    const used = m.connect(x.data, { block: part.id, port: l0 }, { block: 'IC', port: x.id }).data;
    expect(freeLead(used, used.blocks.find(b => b.id === part.id)!, near0)).toBe(l1);
    // a pin of the IC dropped on the resistor body: its free lead
    const r = connectToBody(used, { block: 'IC', port: x.id }, part.id, near0)!;
    expect(r.addedPort).toBeNull();
    expect(r.data.wires.at(-1)!.b).toEqual({ block: part.id, port: l1 });
    // no part involved: not handled
    const y = m.addBlock(used, { ...m.makeBlock(used, { x: 0, y: 500 }), id: 'B3' }).data;
    expect(connectToBody(y, { block: 'IC', port: x.id }, 'B3', { x: 10, y: 510 })).toBeNull();
  });
});

describe('gestures', () => {
  it('drag a resistor lead onto the IC body: a pin and a wire, one undo step', async () => {
    const { s, part } = await setup('res');
    const lead = endPoint({ block: part.id, port: part.ports[0].id }, s.data());
    const steps = s.store.activeDesign!.history.undoDepth;
    s.gestures.down(at(lead.x, lead.y));
    s.gestures.move(at(480, 60));
    s.gestures.up(at(480, 60));
    const ic = s.data().blocks.find(b => b.id === 'IC')!;
    expect(ic.ports).toHaveLength(1);
    expect(s.data().wires).toHaveLength(1);
    expect(s.store.activeDesign!.history.undoDepth).toBe(steps + 1);
    expect(s.gestures.selection[0]).toMatchObject({ kind: 'wire' });
  });

  it('drag a ground lead onto a wire: the wire is split with a junction TAP1', async () => {
    const { s, part } = await setup('gnd');
    // a wire from the IC to a second block below it
    s.edit(d => m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 400 }), id: 'B2', w: 200, h: 100, ports: [] }).data);
    s.edit(d => {
      let x = m.addPort(d, 'IC', 'out'); const p1 = x.id; let data = x.data;
      x = m.addPort(data, 'B2', 'in'); const p2 = x.id; data = x.data;
      data.blocks.find(b => b.id === 'IC')!.ports[0].side = 'b';
      data.blocks.find(b => b.id === 'B2')!.ports[0].side = 't';
      return m.connect(data, { block: 'IC', port: p1 }, { block: 'B2', port: p2 }).data;
    });
    const route = routeAll(s.data()).get(s.data().wires[0].id)!.ps;
    const mid = { x: route[0].x, y: 260 };
    expect(nearestWirePoint(s.data(), routeAll(s.data()), { x: mid.x + 5, y: mid.y }, 12, 10)?.at).toEqual(mid);
    const lead = endPoint({ block: part.id, port: part.ports[0].id }, s.data());
    s.gestures.down(at(lead.x, lead.y));
    s.gestures.move(at(mid.x + 5, mid.y));
    s.gestures.up(at(mid.x + 5, mid.y));
    const d = s.data();
    expect(d.junctions.map(j => j.name)).toEqual(['TAP1']);
    expect(d.wires).toHaveLength(3);
    expect(d.wires.filter(w => [w.a, w.b].some(e => 'junction' in e))).toHaveLength(3);
  });

  it('tapWire keeps the first part, copies the rest, drops arrows and manual routes', () => {
    let d = m.emptyDiagram();
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'A' }).data;
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 400, y: 0 }), id: 'B' }).data;
    const c = m.connect(d, { block: 'A', port: d.blocks[0].ports[1].id }, { block: 'B', port: d.blocks[1].ports[0].id }, { line: { arrow: true } });
    const t = tapWire(c.data, c.id, { x: 300, y: 50 });
    expect(t.data.wires[0]).toMatchObject({ id: c.id, b: { junction: t.junction }, line: { arrow: false } });
    expect(t.data.wires[1]).toMatchObject({ a: { junction: t.junction }, b: { block: 'B' }, line: { arrow: true } });
  });
});
