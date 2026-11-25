// module: designs:function — connectors (designs/function/connector.ts) and the LCD module
// template (lcd.ts): layout rules, pin names from pasted text, wires on removed pins, frame-edge
// snapping, panel fields; the golden FPC against the V2.10.1 export; the LCD template against
// V2.10.1's own afTpl.lcd() run live (same blocks, pins, frame and connections).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  CONN, cleanPins, connectorNode, layoutConnector, makeConnector, nextConnectorName, snapConnectorsToFrames, updateConnector,
} from '../../src/designs/function/connector';
import { insertLcd, lcdOrigin } from '../../src/designs/function/lcd';
import { functionDesign } from '../../src/designs/function';
import { find } from '../../src/render/vnode';
import { validateData } from '../../src/io/schema';
import { routeAll } from '../../src/router/full-path';
import * as m from '../../src/model/diagram';
import { setLocale, type Locale } from '../../src/core/i18n';
import { openApp } from '../helpers/load-app.js';
import { prepare } from '../../src/interaction/commit';
import { convertProject } from '../tools/v2-to-v3';
import type { BlockDiagram } from '../../src/io/schema-types';

const ROOT = path.resolve(__dirname, '../..');
const golden = (): BlockDiagram => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/function/__snapshots__/project.v3.json'), 'utf8')).designs[0].data;
const v2Export = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/function/__snapshots__/export.svg.json'), 'utf8')).elements as Record<string, string>[];

beforeEach(() => setLocale('zh-Hant'));

function withConnector(side: 'l' | 'r' | 'both' = 'r') {
  let d = m.emptyDiagram();
  d.grid.snap = false;
  const cn = makeConnector('b2b', { x: 400, y: 100 }, 'CN1', 'B2B', ['VIN', 'GND', 'SDA', 'SCL'], side);
  d = m.addBlock(d, cn).data;
  const host = { ...m.makeBlock(d, { x: 0, y: 100 }), id: 'H' };
  d = m.addBlock(d, host).data;
  return { d, cn: d.blocks[0], host: d.blocks[1] };
}

describe('connector layout', () => {
  it('one 20 px row per pin, bar 30 px, ports on the wire side named after the pins', () => {
    const { cn } = withConnector('r');
    expect([cn.w, cn.h]).toEqual([CONN.bar, 5 * CONN.pitch]);
    expect(cn.ports.map(p => `${p.name}:${p.side}:${p.pin}:${p.t}`)).toEqual(['VIN:r:0:0.2', 'GND:r:1:0.4', 'SDA:r:2:0.6', 'SCL:r:3:0.8']);
    expect(makeConnector('fpc', { x: 0, y: 0 }, 'CN1', '', undefined, 'both').ports).toHaveLength(16);
  });

  it('changing side / pins keeps wired ports and deletes wires on removed pins', () => {
    let { d, cn, host } = withConnector('r');
    d = m.connect(d, { block: host.id, port: host.ports[0].id }, { block: cn.id, port: cn.ports[2].id }).data;   // SDA
    d = m.connect(d, { block: host.id, port: host.ports[1].id }, { block: cn.id, port: cn.ports[3].id }).data;   // SCL
    const both = updateConnector(d, cn.id, { side: 'both' });
    expect(both.removedWires).toBe(0);
    expect(both.data.blocks[0].ports.filter(p => p.side === 'r').map(p => p.id)).toEqual(cn.ports.map(p => p.id));
    const fewer = updateConnector(both.data, cn.id, { pins: ['VIN', 'GND', 'SDA'] });
    expect(fewer.removedWires).toBe(1);
    expect(fewer.data.wires).toHaveLength(1);
    expect(validateData('function', fewer.data)).toEqual([]);
  });

  it('"wired pins only" hides unwired rows and shows +N', () => {
    let { d, cn, host } = withConnector('r');
    d = m.connect(d, { block: host.id, port: host.ports[0].id }, { block: cn.id, port: cn.ports[2].id }).data;
    const only = updateConnector(d, cn.id, { only: true }).data.blocks[0];
    expect(only.connector).toMatchObject({ visibleRows: [2], hiddenRows: 3 });
    expect(only.h).toBe(3 * CONN.pitch);
    const texts = find(connectorNode(only)!, n => n.tag === 'text').map(n => n.text);
    expect(texts).toEqual(['CN1', '3', 'SDA', '+3']);
    // without wires "only" shows everything (V2)
    expect(layoutConnector(m.addBlock(m.emptyDiagram(), { ...cn, connector: { ...cn.connector!, only: true } }).data, cn.id).data.blocks[0].connector!.visibleRows).toHaveLength(4);
  });

  it('pin names from pasted text (V2 cleanPins), CN numbering', () => {
    expect(cleanPins('VDD\nGND\n\n')).toEqual(['VDD', 'GND']);
    expect(cleanPins('1\tVDD\n2\tGND')).toEqual(['VDD', 'GND']);
    expect(cleanPins('1, VDD\n2: GND\n3. SDA')).toEqual(['VDD', 'GND', 'SDA']);
    expect(cleanPins('x'.repeat(40))).toEqual(['x'.repeat(24)]);
    expect(cleanPins(Array(100).fill('P').join('\n'))).toHaveLength(80);
    const { d } = withConnector();
    expect(nextConnectorName(d)).toBe('CN2');
  });

  it('after a move a connector near a frame edge sits on it', () => {
    let { d, cn } = withConnector();
    d = m.addFrame(d, { x: 300, y: 50, w: 400, h: 300 }).data;
    const moved = { ...d, blocks: d.blocks.map(b => (b.id === cn.id ? { ...b, x: 300 } : b)) };
    expect(snapConnectorsToFrames(moved, [cn.id]).blocks[0].x).toBe(290);       // centre on x = 300
    const far = { ...d, blocks: d.blocks.map(b => (b.id === cn.id ? { ...b, x: 500 } : b)) };
    expect(snapConnectorsToFrames(far, [cn.id]).blocks[0].x).toBe(500);
  });

  it('panel fields', () => {
    const { d, cn } = withConnector();
    const keys = functionDesign.inspectorFields!({ kind: 'block', id: cn.id }, d).map(f => f.key);
    expect(keys).toEqual(['connName', 'connKind', 'connSide', 'connCount', 'connPins', 'connOnly', 'connMpn']);
    const count = functionDesign.inspectorFields!({ kind: 'block', id: cn.id }, d).find(f => f.key === 'connCount')!;
    if (count.kind !== 'number') throw new Error();
    expect(count.set(d, { kind: 'block', id: cn.id }, 6).blocks[0].connector!.pins).toEqual(['VIN', 'GND', 'SDA', 'SCL', '', '']);
  });
});

describe('golden: the FPC of the function golden against V2.10.1', () => {
  it('bar, stiffener, leads, numbers, names and title where V2 exported them', () => {
    const b = golden().blocks.find(x => x.connector)!;
    const v2 = v2Export();
    const g = v2.findIndex(e => e.tag === 'g' && e.transform === `translate(${b.x},${b.y}) scale(1,1)`);
    const v2paths = v2.slice(g + 1).filter((e, i, all) => all.slice(0, i + 1).every(x => Number(x.depth) > Number(v2[g].depth))).filter(e => e.tag === 'path').map(e => e.d);
    const node = connectorNode(b)!;
    const glyph = find(node, n => String(n.attrs.class).includes('af-conn-glyph'))[0];
    expect(glyph.attrs.transform).toBe(v2[g].transform);
    expect(find(glyph, n => n.tag === 'path').map(n => n.attrs.d)).toEqual(v2paths);
    const v2rects = v2.slice(g + 1, g + 3).map(e => [e.x, e.y, e.width, e.height, e.rx].map(Number));
    expect(find(glyph, n => n.tag === 'rect').map(n => [n.attrs.x, n.attrs.y, n.attrs.width, n.attrs.height, n.attrs.rx].map(Number))).toEqual(v2rects);
    // labels: same texts; numbers centred on the bar; names right-aligned 10 px left of it
    const v2texts = v2.filter(e => e.tag === 'text' && Number(e.x) > b.x - 80 && Number(e.x) < b.x + b.w + 10 && Number(e.y) > b.y - 20 && Number(e.y) < b.y + b.h);
    const mine = find(node, n => n.tag === 'text');
    expect(mine.map(n => n.text).sort()).toEqual(v2texts.map(e => e.text).sort());
    for (const n of mine.filter(x => /^\d+$/.test(x.text!))) expect(Number(n.attrs.x)).toBe(b.x + b.w / 2);
    for (const n of mine.filter(x => String(x.attrs.class).includes('is-both'))) expect([n.attrs.x, n.attrs['text-anchor']]).toEqual([b.x - 10, 'end']);
  });
});

describe('golden: LCD template against V2.10.1 afTpl.lcd()', () => {
  const apps: { close(): Promise<void> }[] = [];
  afterAll(async () => { for (const a of apps) await a.close(); });

  for (const locale of ['zh-Hant', 'en'] as Locale[]) {
    it(`${locale}: same blocks, pins, frame and connections`, async () => {
      const app = await openApp({ locale });
      apps.push(app);
      await app.createProject('function', { examples: false });
      await app.eval(() => { afTpl.lcd(); });
      const v2 = convertProject(await app.eval(() => projectData())).designs[0].data as BlockDiagram;

      setLocale(locale);
      const v2frame = v2.frames[0], v2host = v2.blocks[0];
      // place at V2's origin (V2 used its own view centre for an empty design)
      // through the commit step the insert command uses (grid normalisation, as V2's commit)
      const empty = m.emptyDiagram();
      const r = prepare(empty, insertLcd(empty, { x: v2host.x, y: v2host.y - 150 }));
      if (!r.ok) throw r.error;
      const d = r.data;
      const sig = (x: BlockDiagram) => ({
        blocks: x.blocks.map(b => ({ x: b.x - x.frames[0].x, y: b.y - x.frames[0].y, w: b.w, h: b.h, pn: b.partNumber, part: b.part?.kind ?? null, ports: b.ports.map(p => `${p.name}:${p.side}:${p.t}`) })),
        frame: { title: x.frames[0].title, w: x.frames[0].w, h: x.frames[0].h, style: x.frames[0].style, color: x.frames[0].color },
        wires: x.wires.map(w => {
          const end = (e: typeof w.a) => { if (!('block' in e)) return '?'; const i = x.blocks.findIndex(b => b.id === e.block); return `${i}.${x.blocks[i].ports.findIndex(p => p.id === e.port)}`; };
          return `${end(w.a)}>${end(w.b)}:${w.line.arrow}`;
        }),
      });
      expect(sig(d)).toEqual(sig(v2));
      expect(d.frames[0].x - v2frame.x).toBe(d.blocks[0].x - v2host.x);
      expect([...routeAll(d).values()].every(r => r.valid)).toBe(true);
      expect(validateData('function', d)).toEqual([]);
    }, 60000);
  }

  it('goes 160 px right of existing content, top-aligned', () => {
    const d = golden();
    const right = Math.max(...[...d.blocks, ...d.frames].map(b => b.x + b.w)), top = Math.min(...[...d.blocks, ...d.frames].map(b => b.y));
    expect(lcdOrigin(d, { x: 0, y: 0 })).toEqual({ x: right + 160, y: top });
  });
});
