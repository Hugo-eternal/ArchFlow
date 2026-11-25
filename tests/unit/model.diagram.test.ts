// module: core — V3 src/model/diagram.ts (pure block-diagram operations), checked against V2.10.1.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../helpers/load-app.js';
import * as m from '../../src/model/diagram';
import { LIMITS, ModelError } from '../../src/model/types';
import { convertProject } from '../tools/v2-to-v3';
import { normalize } from '../../src/core/grid';
import type { BlockDiagram } from '../../src/io/schema-types';
import fs from 'node:fs';

// afSpreadPorts / afAddFunctionPort (legacy L1237–1239) are not page globals: evaluate their
// exact source in the app window.
const V2_PORTS = (() => {
  const lines = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8').split('\n');
  const get = (prefix: string) => { const l = lines.find(x => x.startsWith(prefix)); if (!l) throw new Error(prefix); return l; };
  return `window.__v2ports = (() => {\n${get('function afSpreadPorts(')}\n${get('function afAddFunctionPort(')}\nreturn { afAddFunctionPort };\n})()`;
})();

type App = Awaited<ReturnType<typeof openApp>>;
let app: App;
let v2File: any;
const toV3 = (diagram: unknown): BlockDiagram => {
  const design = v2File.designs.find((d: { id: string }) => d.id === v2File.activeDesignId);
  return convertProject({ ...v2File, designs: [{ ...design, diagram }] }).designs[0].data as BlockDiagram;
};
beforeAll(async () => { app = await openApp(); await app.createProject('function'); v2File = await app.eval(() => projectData()); });
afterAll(async () => { await app?.close(); });

const twoBlocks = () => {
  let d = m.emptyDiagram();
  const A = m.makeBlock(d, { x: 0, y: 0 }); d = m.addBlock(d, A).data;
  const B = m.makeBlock(d, { x: 400, y: 0 }); d = m.addBlock(d, B).data;
  return { d, A, B };
};

describe('model/diagram matches V2', () => {
  it('deleting a block or a port removes the same wires as V2 removeSelection', async () => {
    const design = v2File.designs.find((x: { id: string }) => x.id === v2File.activeDesignId);
    const base = toV3(design.diagram);
    const busiest = [...base.blocks].sort((a, b) => m.wiresAt(base, { block: b.id }).length - m.wiresAt(base, { block: a.id }).length)[0];
    const port = busiest.ports.find(p => m.wiresAt(base, { block: busiest.id, port: p.id }).length)!;
    expect(m.wiresAt(base, { block: busiest.id }).length).toBeGreaterThan(1);

    const v2 = await app.eval((nid, pid) => {
      const keep = JSON.stringify(model), out: Record<string, string[]> = {};
      selection = { type: 'node', id: nid }; removeSelection(); out.block = model.edges.map(e => e.id); out.nodes = model.nodes.map(n => n.id);
      model = JSON.parse(keep); selection = { type: 'port', node: nid, id: pid }; removeSelection(); out.port = model.edges.map(e => e.id);
      out.ports = model.nodes.find(n => n.id === nid).ports.map(p => p.id);
      model = JSON.parse(keep); render(); return out;
    }, busiest.id, port.id);

    const afterBlock = m.remove(base, [{ kind: 'block', id: busiest.id }]);
    expect(afterBlock.wires.map(w => w.id)).toEqual(v2.block);
    expect(afterBlock.blocks.map(b => b.id)).toEqual(v2.nodes);
    const afterPort = m.remove(base, [{ kind: 'port', block: busiest.id, id: port.id }]);
    expect(afterPort.wires.map(w => w.id)).toEqual(v2.port);
    expect(m.blockOf(afterPort, busiest.id)!.ports.map(p => p.id)).toEqual(v2.ports);
    expect(m.danglingWires(afterBlock)).toEqual([]);
    expect(base.blocks.some(b => b.id === busiest.id)).toBe(true);           // input untouched
  });

  it('addPort + commit normalisation place ports like V2 afAddFunctionPort (grid on)', async () => {
    const design = v2File.designs.find((x: { id: string }) => x.id === v2File.activeDesignId);
    const base = toV3(design.diagram), b = base.blocks[0];
    const steps: [string, 'l' | 'r' | 't' | 'b'][] = [['in', 'l'], ['in', 'l'], ['out', 'r'], ['io', 't'], ['out', 'r']];
    await app.page.evaluate(V2_PORTS);
    const v2 = await app.eval((nid, ss) => {
      const keep = JSON.stringify(model), n = model.nodes.find(x => x.id === nid);
      for (const [type, side] of ss) __v2ports.afAddFunctionPort(n, type, side);
      const nn = model.nodes.find(x => x.id === nid);
      const out = { h: nn.h, w: nn.w, ports: nn.ports.map(p => ({ name: p.name, side: p.side, t: p.t, type: p.type })) };
      model = JSON.parse(keep); render(); return out;
    }, b.id, steps);
    // V2 commit() puts the diagram back on the grid after every edit (legacy L1535); in V3 the
    // commit step runs core/grid.normalize, so do the same here.
    expect(base.grid.snap).toBe(true);
    let d = base;
    for (const [type, side] of steps) d = normalize(m.addPort(d, b.id, type, side).data, base.grid.size);
    expect([m.blockOf(d, b.id)!.w, m.blockOf(d, b.id)!.h]).toEqual([v2.w, v2.h]);
    expect(m.blockOf(d, b.id)!.ports.map(p => ({ name: p.name, side: p.side, t: p.t, type: p.type }))).toEqual(v2.ports);
    // without the grid, the side is spread evenly
    const free = m.addPort(m.addPort({ ...base, grid: { ...base.grid, snap: false } }, b.id, 'in', 'b').data, b.id, 'in', 'b').data;
    const tall = m.blockOf(m.addPort(m.addPort(m.addPort(base, b.id, 'in', 'l').data, b.id, 'in', 'l').data, b.id, 'in', 'l').data, b.id)!;
    expect(tall.h).toBe(Math.max(b.h, 3 * 34 + 50));
    const noGrid = { ...base, grid: { ...base.grid, snap: false } };
    const tall2 = m.blockOf(m.addPort(m.addPort(m.addPort(noGrid, b.id, 'in', 'l').data, b.id, 'in', 'l').data, b.id, 'in', 'l').data, b.id)!;
    expect(tall2.ports.filter(p => p.side === 'l').map(p => p.t)).toEqual([0.25, 0.5, 0.75]);   // grid off: spread, t kept
    expect(m.blockOf(free, b.id)!.ports.filter(p => p.side === 'b').map(p => [p.name, p.t])).toEqual([['IN1', 1 / 3], ['IN2', 2 / 3]]);
  });

  it('a new block has V2 defaults and the next free reference', async () => {
    const used = await app.eval(() => model.nodes.map(n => n.ref));
    const design = v2File.designs.find((x: { id: string }) => x.id === v2File.activeDesignId);
    const base = toV3(design.diagram);
    let i = 1; while (used.includes('U' + i)) i++;
    const b = m.makeBlock(base, { x: 10, y: 20 });
    expect(b.ref).toBe('U' + i);
    expect(b.ports.map(p => [p.name, p.side, p.t, p.type])).toEqual([['IN', 'l', 0.25, 'in'], ['OUT', 'r', 0.5, 'out']]);
    expect([b.x, b.y, b.w, b.partNumber]).toEqual([10, 20, 200, 'IC']);
    expect(m.makeBlock(base, { x: 0, y: 0 }, 'power').role).toBe('converter');
  });
});

describe('model/diagram', () => {
  it('connect, reconnect, clearRoutes and their refusals', () => {
    const { d, A, B } = twoBlocks();
    const a = { block: A.id, port: A.ports[1].id }, b = { block: B.id, port: B.ports[0].id };
    const { data, id } = m.connect(d, a, b, { route: [{ x: 200, y: 50 }, { x: 400, y: 50 }] });
    expect(m.wireOf(data, id)).toMatchObject({ a, b, kind: 'signal', line: { arrow: false } });
    expect(d.wires).toHaveLength(0);
    expect(m.connect(d, a, b, {}, 'power').data.wires[0]).toMatchObject({ kind: 'power', line: { arrow: true }, electrical: { show: true } });
    expect(() => m.connect(d, a, a)).toThrow(ModelError);
    expect(() => m.connect(d, a, { block: B.id, port: 'nope' })).toThrow(/missing/);
    const r = m.reconnect(data, id, 'b', { block: B.id, port: B.ports[1].id });
    expect(m.wireOf(r, id)!.b.port).toBe(B.ports[1].id);
    expect(m.wireOf(r, id)!.route).toBeUndefined();
    expect(() => m.reconnect(data, id, 'b', a)).toThrow(/same-end/);
    const locked = m.updateWire(data, id, { locked: true });
    expect(m.wireOf(m.clearRoutes(locked), id)!.route).toHaveLength(2);
    expect(m.wireOf(m.clearRoutes(data, [id]), id)!.route).toBeUndefined();
  });

  it('junction delete takes its branches; text and frame delete', () => {
    const { d: d0, A, B } = twoBlocks();
    let d = d0;
    const j = m.addJunction(d, { x: 300, y: 50 }); d = j.data;
    d = m.connect(d, { block: A.id, port: A.ports[1].id }, { junction: j.id }).data;
    d = m.connect(d, { junction: j.id }, { block: B.id, port: B.ports[0].id }).data;
    const t = m.addText(d, { x: 5, y: 5 }, 'note'); d = t.data;
    const f = m.addFrame(d, { x: 0, y: 0, w: 700, h: 200 }, 'Board'); d = f.data;
    expect(m.wiresAt(d, { junction: j.id })).toHaveLength(2);
    const r = m.remove(d, [{ kind: 'junction', id: j.id }, { kind: 'text', id: t.id }, { kind: 'frame', id: f.id }]);
    expect([r.wires.length, r.junctions.length, r.texts.length, r.frames.length]).toEqual([0, 0, 0, 0]);
    expect(m.addText(d, { x: 0, y: 0 }).data.texts.at(-1)).toMatchObject({ align: 'left', background: 'transparent', size: 16, w: 180 });
  });

  it('moveItems moves routes only when both ends move', () => {
    const { d: d0, A, B } = twoBlocks();
    const { data, id } = m.connect(d0, { block: A.id, port: A.ports[1].id }, { block: B.id, port: B.ports[0].id }, { route: [{ x: 200, y: 50 }, { x: 400, y: 50 }] });
    const one = m.moveItems(data, [A.id], 10, 0);
    expect(m.blockOf(one, A.id)!.x).toBe(10);
    expect(m.wireOf(one, id)!.route![0].x).toBe(200);
    const both = m.moveItems(data, [A.id, B.id], 10, 20);
    expect(m.wireOf(both, id)!.route).toEqual([{ x: 210, y: 70 }, { x: 410, y: 70 }]);
  });

  it('limits and updates', () => {
    const d = m.emptyDiagram();
    d.blocks = Array.from({ length: LIMITS.blocks }, (_, i) => ({ ...m.makeBlock(d, { x: i, y: 0 }), ref: 'U' + (i + 1) }));
    expect(() => m.addBlock(d, m.makeBlock(d, { x: 0, y: 0 }))).toThrow(/limit-blocks/);
    expect(m.nextRef(d)).toBe('U101');
    const full = m.emptyDiagram(), b = m.makeBlock(full, { x: 0, y: 0 });
    b.ports = Array.from({ length: LIMITS.portsPerBlock }, (_, i) => m.makePort('P' + i, 'l', 0.5));
    full.blocks.push(b);
    expect(() => m.addPort(full, b.id)).toThrow(/limit-ports/);
    const u = m.updateBlock(full, b.id, { title: 'MCU', x: 40 });
    expect([m.blockOf(u, b.id)!.title, m.blockOf(u, b.id)!.x, m.blockOf(full, b.id)!.title]).toEqual(['MCU', 40, '']);
    const p = m.updatePort(full, b.id, b.ports[0].id, { name: 'VIN' });
    expect(m.portOf(p, b.id, b.ports[0].id)!.name).toBe('VIN');
    expect(() => m.updateBlock(full, 'x', {})).toThrow(/missing/);
    const tx = m.addText(m.emptyDiagram(), { x: 0, y: 0 });
    expect(m.updateText(tx.data, tx.id, { text: 'x'.repeat(30000) }).texts[0].text).toHaveLength(LIMITS.text);
  });
});
