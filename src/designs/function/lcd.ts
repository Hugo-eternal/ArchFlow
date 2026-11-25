// LCD module template (V2.4.2 L4590–L4652): one insert that lays out a panel frame, an FPC on
// its edge, TCON, source / gate drivers, a backlight driver with an LED string and a host board
// outside the frame — all ordinary editable content, one undo step. Placed 160 px right of the
// existing content (top-aligned with it), or near the view centre on an empty design.
import type { Block, BlockDiagram, Port } from '../../model/types';
import { addFrame, connect, makeBlock, makePort } from '../../model/diagram';
import { t } from '../../core/i18n';
import { makePart } from './parts';
import { makeConnector, nextConnectorName } from './connector';

type PinSpec = [name: string, side: Port['side'], t: number, type?: string];

function block(d: BlockDiagram, x: number, y: number, w: number, h: number, name: string, pins: PinSpec[]): Block {
  const b = makeBlock(d, { x, y });
  return { ...b, x, y, w, h, partNumber: name, title: '', ref: '', ports: pins.map(([n, side, tt, type]) => makePort(n, side, tt, type ?? 'io')) };
}

/** Where the template goes: right of everything (frames included), or from `centre` when empty. */
export function lcdOrigin(d: BlockDiagram, centre: { x: number; y: number }, step = 10): { x: number; y: number } {
  const R = (v: number) => Math.round(v / step) * step;
  const items = [...d.blocks, ...d.frames];
  if (!items.length) return { x: R(centre.x - 560), y: R(centre.y - 280) };
  return { x: R(Math.max(...items.map(b => b.x + b.w)) + 160), y: R(Math.min(...items.map(b => b.y))) };
}

/** The diagram with the LCD module template added (V2 afTpl.lcd). */
export function insertLcd(d: BlockDiagram, origin: { x: number; y: number }): BlockDiagram {
  const X = (v: number) => origin.x + v, Y = (v: number) => origin.y + 40 + v;
  const host = block(d, X(0), Y(110), 200, 180, t('lcd.host'), [['PWR', 'r', 0.25, 'power'], ['LVDS', 'r', 0.5], ['BL_EN', 'r', 0.75]]);
  const tcon = block(d, X(420), Y(60), 200, 160, 'TCON', [['LVDS', 'l', 0.5], ['SRC', 'r', 0.375], ['GATE', 'r', 0.625]]);
  const src = block(d, X(780), Y(30), 260, 100, t('lcd.source'), [['IN', 'l', 0.5]]);
  const gate = block(d, X(780), Y(170), 260, 100, t('lcd.gate'), [['IN', 'l', 0.5]]);
  const bl = block(d, X(420), Y(300), 200, 120, t('lcd.backlight'), [['EN', 'l', 0.5], ['OUT', 'r', 0.5]]);
  const led = (x: number) => { const p = makePart('led', { x: 0, y: 0 }, 'LED'); return { ...p, x, y: Y(340) }; };
  const l1 = led(X(720)), l2 = led(X(880));
  const cn = { ...makeConnector('fpc', { x: X(285), y: Y(120) }, nextConnectorName(d), t('part.conn-fpc'), ['VDD', 'GND', 'LVDS+', 'LVDS−', 'BL_EN', 'BL_PWM'], 'both') };
  let out: BlockDiagram = { ...d, blocks: [...d.blocks, host, cn, tcon, src, gate, bl, l1, l2] };
  out = addFrame(out, { x: X(300), y: Y(-20), w: 800, h: 480 }, t('lcd.frame')).data;
  const pin = (b: Block, name: string, end?: 'l' | 'r') => b.ports.find(p => p.name === name && (!end || p.end === end || p.side === end))!;
  const wire = (a: Block, pa: Port, b: Block, pb: Port, arrow = true) => { out = connect(out, { block: a.id, port: pa.id }, { block: b.id, port: pb.id }, { line: { arrow, color: '#536b8c', width: 2 } }).data; };
  wire(host, pin(host, 'PWR'), cn, pin(cn, 'VDD', 'l'), false);
  wire(host, pin(host, 'LVDS'), cn, pin(cn, 'LVDS+', 'l'));
  wire(host, pin(host, 'BL_EN'), cn, pin(cn, 'BL_EN', 'l'));
  wire(cn, pin(cn, 'LVDS+', 'r'), tcon, pin(tcon, 'LVDS'));
  wire(cn, pin(cn, 'BL_EN', 'r'), bl, pin(bl, 'EN'));
  wire(tcon, pin(tcon, 'SRC'), src, pin(src, 'IN'));
  wire(tcon, pin(tcon, 'GATE'), gate, pin(gate, 'IN'));
  wire(bl, pin(bl, 'OUT'), l1, pin(l1, 'A'), false);
  wire(l1, pin(l1, 'K'), l2, pin(l2, 'A'), false);
  return out;
}
