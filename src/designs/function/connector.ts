// Connectors of function designs (FPC / FFC, board-to-board, harness): a narrow bar with one pin
// per 20 px row, so every pin sits on the grid and wires meet it exactly.
//
// V2: V2.4.1 connector module L4455–L4588 — layout (visible rows, "+N" for unwired pins when
// "wired pins only" is on, port ids kept, wires on removed pins deleted), glyph, decorate,
// panel (type / wire side / pin count / names / wired only / Maker_Part_Number), cleanPins,
// and the snap onto a frame edge after a move (L4569). Label geometry from V2 CSS .af41-*:
// pin number 10 px centred on the bar; name 11.5 px 6 px beside the bar on the side away
// from the wires (both sides: 10.5 px above the row, right-aligned 10 px left of the bar);
// connector name 12 px / 600 centred 4 px above the bar.
import type { Block, BlockDiagram, Connector, Port } from '../../model/types';
import { uid } from '../../core/ids';
import { h, r2, type VNode } from '../../render/vnode';

export const CONN = Object.freeze({ pitch: 20, bar: 30, maxPins: 80, nameMax: 24, snap: 30 });
export const CONN_KINDS = ['fpc', 'b2b', 'har'] as const;
export const CONN_SIDES = ['l', 'r', 'both'] as const;
export type ConnKind = (typeof CONN_KINDS)[number];

/** Starting pin names per kind (V2 DEFAULT). */
export const DEFAULT_PINS: Record<ConnKind, readonly string[]> = {
  fpc: ['VDD', 'GND', 'LVDS0+', 'LVDS0−', 'LVDS1+', 'LVDS1−', 'BL_PWM', 'GND'],
  b2b: ['VIN', 'GND', 'SDA', 'SCL', 'INT', 'RST'],
  har: ['B+', 'IGN', 'GND', 'SIG'],
};

const wiredPorts = (d: BlockDiagram, blockId: string) => {
  const s = new Set<string>();
  for (const w of d.wires) for (const e of [w.a, w.b]) if ('block' in e && e.block === blockId) s.add(e.port);
  return s;
};

/**
 * Lay out a connector block in `d`: visible rows, size 30 × (rows + 1) × 20, one port per row and
 * wire side (existing port ids kept: exact pin + side first, then any port of that pin, wired
 * ones first). Wires on ports that no longer exist are removed; their count is returned.
 */
export function layoutConnector(d: BlockDiagram, blockId: string): { data: BlockDiagram; removedWires: number } {
  const b = d.blocks.find(x => x.id === blockId);
  if (!b?.connector) return { data: d, removedWires: 0 };
  const c = b.connector, live = wiredPorts(d, b.id), count = c.pins.length;
  const linked = new Set(b.ports.filter(p => live.has(p.id)).map(p => p.pin));
  let vis = [...Array(count).keys()];
  if (c.only && linked.size) vis = vis.filter(i => linked.has(i));
  const hidden = count - vis.length, rows = vis.length + (hidden ? 1 : 0);
  const ends: ('l' | 'r')[] = c.side === 'both' ? ['l', 'r'] : [c.side];
  const pool = [...b.ports], slot = new Map<string, Port>();
  for (const i of vis) for (const e of ends) {
    const k = pool.findIndex(p => p.pin === i && p.end === e);
    if (k >= 0) slot.set(`${i}${e}`, pool.splice(k, 1)[0]);
  }
  for (const i of vis) for (const e of ends) {
    if (slot.has(`${i}${e}`)) continue;
    const cands = pool.map((p, k) => [p, k] as const).filter(([p]) => p.pin === i).sort((x, y) => Number(live.has(y[0].id)) - Number(live.has(x[0].id)));
    if (cands.length) slot.set(`${i}${e}`, pool.splice(cands[0][1], 1)[0]);
  }
  const ports: Port[] = [];
  vis.forEach((i, r) => {
    for (const e of ends) {
      const p = slot.get(`${i}${e}`);
      ports.push({
        id: p?.id ?? uid(), name: c.pins[i] || String(i + 1), side: e, t: Number(((r + 1) / (rows + 1)).toFixed(4)),
        type: p?.type ?? 'io', label: 'hidden', locked: p?.locked ?? false, pin: i, end: e,
      });
    }
  });
  const gone = new Set(pool.map(p => p.id));
  const wires = d.wires.filter(w => !(('block' in w.a && w.a.block === b.id && gone.has(w.a.port)) || ('block' in w.b && w.b.block === b.id && gone.has(w.b.port))));
  const nb: Block = { ...b, w: CONN.bar, h: (rows + 1) * CONN.pitch, ports, connector: { ...c, visibleRows: vis, hiddenRows: hidden } };
  return { data: { ...d, blocks: d.blocks.map(x => (x.id === b.id ? nb : x)), wires }, removedWires: d.wires.length - wires.length };
}

/** A new connector block (V2 shape): name = `ref` (CN1 …), title = the kind's name, wires on the right. */
export function makeConnector(kind: ConnKind, at: { x: number; y: number }, ref: string, title: string, pins: readonly string[] = DEFAULT_PINS[kind], side: Connector['side'] = 'r'): Block {
  const b: Block = {
    id: uid(), x: at.x, y: at.y, w: CONN.bar, h: CONN.pitch, title, subtitle: '', partNumber: ref, ref: '',
    ports: [], style: {}, sizing: 'auto', showTitle: true, locked: false, metrics: {},
    part: { kind: 'conn', rot: 0, size: 'M' },
    connector: { kind, side, pins: [...pins], only: false, mpn: '', visibleRows: [], hiddenRows: 0 },
  };
  const laid = layoutConnector({ view: 'function', blocks: [b], wires: [], junctions: [], texts: [], frames: [], grid: { size: 10, show: false, snap: false }, wirePresets: [], presentationClean: false }, b.id);
  return laid.data.blocks[0];
}

/** Change connector settings and lay it out again (pins removed take their wires along). */
export function updateConnector(d: BlockDiagram, id: string, patch: Partial<Pick<Connector, 'kind' | 'side' | 'pins' | 'only' | 'mpn'>>): { data: BlockDiagram; removedWires: number } {
  const data = { ...d, blocks: d.blocks.map(b => (b.id === id && b.connector ? { ...b, connector: { ...b.connector, ...patch } } : b)) };
  return layoutConnector(data, id);
}

/** Next free "CNn" name (V2 nextCn). */
export function nextConnectorName(d: BlockDiagram): string {
  let max = 0;
  for (const b of d.blocks) { const m = /^CN(\d+)$/.exec(b.partNumber || ''); if (m) max = Math.max(max, Number(m[1])); }
  return `CN${max + 1}`;
}

/** Pin names from pasted text: one per line; "1<TAB>VDD" or "1, VDD" keeps the name (V2 cleanPins). */
export function cleanPins(text: string): string[] {
  const lines = String(text).replace(/\r/g, '').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.slice(0, CONN.maxPins)
    .map(l => l.split('\t').map(x => x.trim()).filter(Boolean))
    .map(cells => (!cells.length ? '' : cells.length > 1 && /^\d+$/.test(cells[0]) ? cells[1] : cells[0].replace(/^\d+\s*[,:.\u3001]\s*/, '')))
    .map(x => x.slice(0, CONN.nameMax));
}

/**
 * After a move, a connector whose centre is within 30 px of a frame's left / right edge (and
 * vertically within the frame ± 10) sits centred on that edge (V2 L4569).
 */
export function snapConnectorsToFrames(d: BlockDiagram, moved: readonly string[], step = 10): BlockDiagram {
  if (!d.frames.length) return d;
  let changed = false;
  const blocks = d.blocks.map(b => {
    if (!b.connector || !moved.includes(b.id)) return b;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let lim: number = CONN.snap, best: number | null = null;
    for (const f of d.frames) {
      if (cy < f.y - 10 || cy > f.y + f.h + 10) continue;
      for (const ex of [f.x, f.x + f.w]) { const dd = Math.abs(cx - ex); if (dd < lim) { lim = dd; best = ex; } }
    }
    if (best === null) return b;
    const x = Math.round((best - b.w / 2) / step) * step;
    if (x === b.x) return b;
    changed = true;
    return { ...b, x };
  });
  return changed ? { ...d, blocks } : d;
}

/** Drawing of a connector block: bar, leads, pin numbers / names, its name above. */
export function connectorNode(b: Block): VNode | null {
  const c = b.connector;
  if (!c) return null;
  const { x, y, w, h: hh } = b, P = CONN.pitch;
  const vis = c.visibleRows.length || c.hiddenRows ? c.visibleRows : c.pins.map((_, i) => i);
  const x1 = c.side === 'l' || c.side === 'both' ? 6 : 2, x2 = c.side === 'r' || c.side === 'both' ? w - 6 : w - 2, bw = x2 - x1;
  const parts: VNode[] = [h('rect', { class: 'af-conn-bar', x: x1, y: 4, width: bw, height: hh - 8, rx: c.kind === 'har' ? 8 : 3 })];
  if (c.kind === 'fpc') parts.push(h('rect', { class: 'af-conn-stiffener', x: x1, y: 4, width: bw, height: 7, rx: 2 }), h('path', { d: `M${x1} 11H${x2}` }));
  if (c.kind === 'b2b') parts.push(h('path', { class: 'af-conn-split', d: `M${(x1 + x2) / 2} 8V${hh - 8}` }));
  vis.forEach((_, r) => {
    const ry = (r + 1) * P;
    if (c.side !== 'r') parts.push(h('path', { d: `M0 ${ry}H${x1}` }));
    if (c.side !== 'l') parts.push(h('path', { d: `M${x2} ${ry}H${w}` }));
  });
  const glyph = h('g', { class: 'af-part-glyph af-conn-glyph', transform: `translate(${r2(x)},${r2(y)}) scale(1,1)` }, parts);
  const labels: VNode[] = [];
  if (b.partNumber) labels.push(h('text', { class: 'af-conn-title', x: r2(x + w / 2), y: r2(y - 4 - 7.2), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, b.partNumber));
  vis.forEach((i, r) => {
    const ry = y + (r + 1) * P;
    labels.push(h('text', { class: 'af-conn-num', x: r2(x + w / 2), y: r2(ry), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(i + 1)));
    const name = c.pins[i];
    if (!name) return;
    if (c.side === 'both') labels.push(h('text', { class: 'af-conn-name is-both', x: r2(x - 10), y: r2(ry - 2 - 5.25), 'text-anchor': 'end', 'dominant-baseline': 'central' }, name));
    else if (c.side === 'r') labels.push(h('text', { class: 'af-conn-name', x: r2(x - 6), y: r2(ry), 'text-anchor': 'end', 'dominant-baseline': 'central' }, name));
    else labels.push(h('text', { class: 'af-conn-name', x: r2(x + w + 6), y: r2(ry), 'dominant-baseline': 'central' }, name));
  });
  if (c.hiddenRows) labels.push(h('text', { class: 'af-conn-more', x: r2(x + w / 2), y: r2(y + (vis.length + 1) * P), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, `+${c.hiddenRows}`));
  return h('g', { class: 'af-conn' }, [glyph, ...labels]);
}

/** Bounds of a connector's labels (for export bounds), names estimated at 6.5 px per character. */
export function connectorBounds(b: Block): { x: number; y: number; w: number; h: number }[] {
  const c = b.connector;
  if (!c) return [];
  const longest = Math.max(0, ...c.pins.map(p => p.length)) * 6.5;
  const out = [{ x: b.x, y: b.y - 18.4, w: b.w, h: 14.4 }];
  if (c.side !== 'l') out.push({ x: b.x - 10 - longest, y: b.y, w: longest, h: b.h });
  if (c.side === 'l') out.push({ x: b.x + b.w + 6, y: b.y, w: longest, h: b.h });
  return out;
}
