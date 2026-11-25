// Pure operations on a block diagram (function and power designs). Each takes the current
// data and returns new data (inputs are never changed) — commands run them inside
// history.update / history.batch. No DOM, no camera: positions are given in world space.
//
// V2: #add L327, removeSelection L329 (+ text L505), makePin L256, afAddFunctionPort /
// afSpreadPorts L1237–1239, port-count sizing L1257, newFreeText L497, wire creation in pointerup L319.
// Route validity (does a wire find a path?) is the router's job (3.15) and not checked here.
import { clone, uid } from '../core/ids';
import type { Block, BlockDiagram, BlockView, Frame, Junction, LineFormat, Point, Port, TextBox, Wire, WireEnd } from '../io/schema-types';
import { LIMITS, ModelError, isJunctionEnd, type BlockPatch, type ItemRef, type Side } from './types';
import { DEFAULT_GRID } from '../core/grid';

export function emptyDiagram(view: BlockView = 'function'): BlockDiagram {
  return { view, blocks: [], wires: [], junctions: [], texts: [], frames: [], grid: { ...DEFAULT_GRID }, wirePresets: [], presentationClean: false };
}

// ------------------------------------------------------------------ lookups

export const blockOf = (d: BlockDiagram, id: string) => d.blocks.find(b => b.id === id);
export const wireOf = (d: BlockDiagram, id: string) => d.wires.find(w => w.id === id);
export const portOf = (d: BlockDiagram, block: string, port: string) => blockOf(d, block)?.ports.find(p => p.id === port);

/** Does a wire end point at `block` (and, when given, at its `port`)? */
export const touches = (e: WireEnd, block: string, port?: string) =>
  !isJunctionEnd(e) && e.block === block && (port === undefined || e.port === port);

const endExists = (d: BlockDiagram, e: WireEnd) =>
  isJunctionEnd(e) ? d.junctions.some(j => j.id === e.junction) : !!portOf(d, e.block, e.port);

const sameEnd = (a: WireEnd, b: WireEnd) => JSON.stringify(a) === JSON.stringify(b);

/** Wires that end at a block, a port or a junction. */
export function wiresAt(d: BlockDiagram, at: { block: string; port?: string } | { junction: string }): Wire[] {
  const hit = (e: WireEnd) => ('junction' in at ? isJunctionEnd(e) && e.junction === at.junction : touches(e, at.block, at.port));
  return d.wires.filter(w => hit(w.a) || hit(w.b));
}

/** Wires whose ends point nowhere (a healthy diagram has none). */
export const danglingWires = (d: BlockDiagram) => d.wires.filter(w => !endExists(d, w.a) || !endExists(d, w.b));

/** First free reference "U1", "U2", … (V2 #add). */
export function nextRef(d: BlockDiagram, prefix = 'U'): string {
  const used = new Set(d.blocks.map(b => b.ref));
  let i = 1;
  while (used.has(prefix + i)) i++;
  return prefix + i;
}

// ------------------------------------------------------------------ blocks

export const BLOCK_DEFAULT = Object.freeze({ w: 200, h: 100, titleSize: 26.6666666667 });

export function makePort(name: string, side: Side, t: number, type = 'io'): Port {
  return { id: uid(), name, side, t, type, label: 'inside', locked: false };
}

/** A new block as V2's "add block" made it; `at` is its top-left corner. Defaults follow the view. */
export function makeBlock(d: BlockDiagram, at: Point, view: BlockView = d.view): Block {
  const b: Block = {
    id: uid(), x: at.x, y: at.y, w: BLOCK_DEFAULT.w, h: BLOCK_DEFAULT.h,
    title: '', subtitle: '', partNumber: 'IC', ref: nextRef(d),
    ports: [makePort('IN', 'l', 0.25, 'in'), makePort('OUT', 'r', 0.5, 'out')],
    style: { titleSize: BLOCK_DEFAULT.titleSize },
    sizing: 'auto', showTitle: true, locked: false, metrics: {},
  };
  if (view === 'power') {
    b.role = 'converter';
    b.metrics = { voltage: { value: '', show: false }, current: { value: '', show: false } };
  }
  return b;
}

/** Add a block (new or prepared). Returns the new data and the block's id. */
export function addBlock(d: BlockDiagram, block: Block): { data: BlockDiagram; id: string } {
  if (d.blocks.length >= LIMITS.blocks) throw new ModelError('limit-blocks');
  const data = clone(d);
  data.blocks.push(clone(block));
  return { data, id: block.id };
}

export function updateBlock(d: BlockDiagram, id: string, patch: BlockPatch): BlockDiagram {
  const data = clone(d), b = blockOf(data, id);
  if (!b) throw new ModelError('missing', id);
  Object.assign(b, clone(patch));
  return data;
}

/** Move blocks, junctions, texts and frames by (dx, dy); manual routes of wires whose both ends move go along. */
export function moveItems(d: BlockDiagram, ids: Iterable<string>, dx: number, dy: number): BlockDiagram {
  const set = new Set(ids), data = clone(d);
  for (const list of [data.blocks, data.junctions, data.texts, data.frames] as { id: string; x: number; y: number }[][])
    for (const it of list) if (set.has(it.id)) { it.x += dx; it.y += dy; }
  const moved = (e: WireEnd) => set.has(isJunctionEnd(e) ? e.junction : e.block);
  for (const w of data.wires) if (w.route && moved(w.a) && moved(w.b)) w.route = w.route.map(p => ({ x: p.x + dx, y: p.y + dy }));
  return data;
}

// ------------------------------------------------------------------ ports

const PREFIX: Record<string, string> = { out: 'OUT', io: 'IO', in: 'IN' };

/** Spread the ports of one side evenly (V2 afSpreadPorts). */
export function spreadPorts(b: Block, side: Side): void {
  const list = b.ports.filter(p => p.side === side);
  list.forEach((p, i) => { p.t = (i + 1) / (list.length + 1); });
}

/**
 * Grow an auto-sized block so its ports fit (V2 did this inside render, L1257): more than two
 * ports on the left / right side → h ≥ n × 34 + 50; more than three on top / bottom → w ≥ n × 65.
 * Parts (symbols) and free-sized blocks keep their size. With `keepOffsets` (grid on) ports stay
 * at the same distance from the corner, as V2's afGridOffset did; otherwise they keep `t`.
 */
export function growForPorts(b: Block, keepOffsets = false): void {
  if (b.part || b.sizing === 'free') return;
  const count = (s: Side) => b.ports.filter(p => p.side === s).length;
  const vertical = Math.max(count('l'), count('r')), horizontal = Math.max(count('t'), count('b'));
  const before = { w: b.w, h: b.h };
  if (vertical > 2) b.h = Math.max(b.h || 80, vertical * 34 + 50);
  if (horizontal > 3) b.w = Math.max(b.w || 250, horizontal * 65);
  if (keepOffsets) for (const p of b.ports) {
    const dim = p.side === 'l' || p.side === 'r' ? 'h' : 'w';
    if (before[dim] && b[dim] !== before[dim]) p.t = (p.t * before[dim]) / b[dim];
  }
}

/**
 * Add a port named IN1 / OUT1 / IO1 … (first free number). Without `t`: with the grid off the
 * side is re-spread evenly (V2 afAddFunctionPort); with the grid on the existing ports stay put
 * and the new one goes to n / (n + 1) of the side — the commit's grid normalisation then moves
 * it clear of its neighbours (V2's afGridOffset made existing ports ignore the re-spread).
 */
export function addPort(d: BlockDiagram, blockId: string, type = 'in', side: Side = type === 'out' ? 'r' : 'l', t?: number): { data: BlockDiagram; id: string } {
  const data = clone(d), b = blockOf(data, blockId);
  if (!b) throw new ModelError('missing', blockId);
  if (b.ports.length >= LIMITS.portsPerBlock) throw new ModelError('limit-ports', blockId);
  const prefix = PREFIX[type] ?? 'IN';
  let i = 1;
  while (b.ports.some(p => p.name === prefix + i)) i++;
  const p = makePort(prefix + i, side, t ?? 0.5, type);
  b.ports.push(p);
  const grid = data.grid?.snap === true;
  if (t === undefined) {
    if (grid) { const n = b.ports.filter(q => q.side === side).length; p.t = n / (n + 1); }
    else spreadPorts(b, side);
  }
  growForPorts(b, grid);
  return { data, id: p.id };
}

export function updatePort(d: BlockDiagram, blockId: string, portId: string, patch: Partial<Omit<Port, 'id'>>): BlockDiagram {
  const data = clone(d), p = portOf(data, blockId, portId);
  if (!p) throw new ModelError('missing', portId);
  Object.assign(p, patch);
  return data;
}

// ------------------------------------------------------------------ wires and junctions

export interface WireOptions { name?: string; kind?: string; line?: Partial<LineFormat>; route?: Point[] }
export const WIRE_LINE_DEFAULT: Readonly<LineFormat> = Object.freeze({ color: '', width: 2.2, dash: 'solid', arrow: false });

/**
 * Connect two ends. Refuses a wire from an end to itself, unknown ends and the 400-wire limit.
 * In the power view new wires default to power wires with an arrow (V2 L319).
 */
export function connect(d: BlockDiagram, a: WireEnd, b: WireEnd, opts: WireOptions = {}, view: BlockView = d.view): { data: BlockDiagram; id: string } {
  if (sameEnd(a, b)) throw new ModelError('same-end');
  for (const e of [a, b]) if (!endExists(d, e)) throw new ModelError('missing', isJunctionEnd(e) ? e.junction : e.port);
  if (d.wires.length >= LIMITS.wires) throw new ModelError('limit-wires');
  const power = view === 'power';
  const w: Wire = {
    id: uid(), a: { ...a }, b: { ...b }, name: opts.name ?? '', kind: opts.kind ?? (power ? 'power' : 'signal'),
    line: { ...WIRE_LINE_DEFAULT, arrow: power, ...opts.line }, locked: false,
  };
  if (opts.route?.length) w.route = opts.route.map(p => ({ ...p }));
  if (power) w.electrical = { voltage: '', current: '', show: true };
  const data = clone(d);
  data.wires.push(w);
  return { data, id: w.id };
}

export function updateWire(d: BlockDiagram, id: string, patch: Partial<Omit<Wire, 'id'>>): BlockDiagram {
  const data = clone(d), w = wireOf(data, id);
  if (!w) throw new ModelError('missing', id);
  Object.assign(w, clone(patch));
  return data;
}

/** Re-attach one end of a wire (V2 "reconnect" drag). */
export function reconnect(d: BlockDiagram, id: string, end: 'a' | 'b', to: WireEnd): BlockDiagram {
  const w = wireOf(d, id);
  if (!w) throw new ModelError('missing', id);
  if (!endExists(d, to)) throw new ModelError('missing', isJunctionEnd(to) ? to.junction : to.port);
  if (sameEnd(to, end === 'a' ? w.b : w.a)) throw new ModelError('same-end');
  const data = clone(d), nw = wireOf(data, id)!;
  nw[end] = { ...to };
  delete nw.route;                                  // the old manual route no longer fits
  return data;
}

/** Drop the manual route of the given wires (all when omitted) so the router redraws them (V2 #reroute). */
export function clearRoutes(d: BlockDiagram, ids?: Iterable<string>): BlockDiagram {
  const set = ids ? new Set(ids) : null, data = clone(d);
  for (const w of data.wires) if (!w.locked && (!set || set.has(w.id))) delete w.route;
  return data;
}

export function addJunction(d: BlockDiagram, at: Point, name = ''): { data: BlockDiagram; id: string } {
  const data = clone(d), j: Junction = { id: uid(), x: at.x, y: at.y, name };
  data.junctions.push(j);
  return { data, id: j.id };
}

// ------------------------------------------------------------------ texts and frames

export const TEXT_DEFAULT = Object.freeze({ w: 180, size: 16, color: '#243e5d' });

/** A free text box at `at` (V2 newFreeText; V2 lost align / background on save — fixed, CHANGELOG). */
export function addText(d: BlockDiagram, at: Point, text = ''): { data: BlockDiagram; id: string } {
  const t: TextBox = {
    id: uid(), text: text.slice(0, LIMITS.text), x: at.x, y: at.y, w: TEXT_DEFAULT.w, size: TEXT_DEFAULT.size,
    color: TEXT_DEFAULT.color, bold: false, italic: false, align: 'left', background: 'transparent',
  };
  const data = clone(d);
  data.texts.push(t);
  return { data, id: t.id };
}

export function updateText(d: BlockDiagram, id: string, patch: Partial<Omit<TextBox, 'id'>>): BlockDiagram {
  const data = clone(d), t = data.texts.find(x => x.id === id);
  if (!t) throw new ModelError('missing', id);
  Object.assign(t, patch);
  if (typeof t.text === 'string') t.text = t.text.slice(0, LIMITS.text);
  return data;
}

/** Area frames (V2.4.0 L4288): styles dash / solid / fill, colours teal / blue / amber / gray, at least 120 × 80. */
export const FRAME = Object.freeze({ minW: 120, minH: 80, defaultW: 400, defaultH: 260, pad: 30, styles: ['dash', 'solid', 'fill'], colors: ['teal', 'blue', 'amber', 'gray'] });

export function addFrame(d: BlockDiagram, rect: Pick<Frame, 'x' | 'y' | 'w' | 'h'>, title = '', color = 'teal', style = 'dash'): { data: BlockDiagram; id: string } {
  const f: Frame = { id: uid(), title: title.slice(0, 80), x: rect.x, y: rect.y, w: Math.max(FRAME.minW, rect.w), h: Math.max(FRAME.minH, rect.h), style, color };
  const data = clone(d);
  data.frames.push(f);
  return { data, id: f.id };
}

export function updateFrame(d: BlockDiagram, id: string, patch: Partial<Omit<Frame, 'id'>>): BlockDiagram {
  const data = clone(d), f = data.frames.find(x => x.id === id);
  if (!f) throw new ModelError('missing', id);
  Object.assign(f, patch);
  f.w = Math.max(FRAME.minW, f.w);
  f.h = Math.max(FRAME.minH, f.h);
  f.title = f.title.slice(0, 80);
  return data;
}

/**
 * What a frame carries when it moves (V2 members L4307): blocks and text boxes whose centre is
 * inside it, junctions inside it, and frames entirely inside it.
 */
export function frameMembers(d: BlockDiagram, id: string): string[] {
  const f = d.frames.find(x => x.id === id);
  if (!f) return [];
  const inside = (x: number, y: number) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
  return [
    ...d.blocks.filter(b => inside(b.x + b.w / 2, b.y + b.h / 2)).map(b => b.id),
    ...d.junctions.filter(j => inside(j.x, j.y)).map(j => j.id),
    ...d.texts.filter(t => inside(t.x + t.w / 2, t.y + 8)).map(t => t.id),
    ...d.frames.filter(g => g !== f && g.x >= f.x && g.y >= f.y && g.x + g.w <= f.x + f.w && g.y + g.h <= f.y + f.h).map(g => g.id),
  ];
}

/** Shrink / grow a frame around its contents with a 30 px margin (V2 fitFrame); null when it holds nothing. */
export function fitFrame(d: BlockDiagram, id: string, step = 10): BlockDiagram | null {
  const ids = new Set(frameMembers(d, id));
  const boxes = [
    ...d.blocks.filter(b => ids.has(b.id)),
    ...d.texts.filter(t => ids.has(t.id)).map(t => ({ x: t.x, y: t.y, w: t.w || 80, h: 24 })),
    ...d.frames.filter(g => ids.has(g.id)),
    ...d.junctions.filter(j => ids.has(j.id)).map(j => ({ x: j.x, y: j.y, w: 0, h: 0 })),
  ];
  if (!boxes.length) return null;
  const S = (v: number) => Math.round(v / step) * step;
  const x1 = S(Math.min(...boxes.map(b => b.x)) - FRAME.pad), y1 = S(Math.min(...boxes.map(b => b.y)) - FRAME.pad - 10);
  const x2 = S(Math.max(...boxes.map(b => b.x + b.w)) + FRAME.pad), y2 = S(Math.max(...boxes.map(b => b.y + b.h)) + FRAME.pad);
  return updateFrame(d, id, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
}

// ------------------------------------------------------------------ deletion

/**
 * Delete items with everything that would dangle (V2 removeSelection L329 / L505):
 * a block takes its wires, a port takes its wires, a junction takes all its branches.
 */
export function remove(d: BlockDiagram, items: readonly ItemRef[]): BlockDiagram {
  const data = clone(d);
  const blocks = new Set<string>(), wires = new Set<string>(), junctions = new Set<string>(), texts = new Set<string>(), frames = new Set<string>();
  const ports: { block: string; id: string }[] = [];
  for (const it of items) {
    if (it.kind === 'block') blocks.add(it.id);
    else if (it.kind === 'port') ports.push(it);
    else if (it.kind === 'wire') wires.add(it.id);
    else if (it.kind === 'junction') junctions.add(it.id);
    else if (it.kind === 'text') texts.add(it.id);
    else frames.add(it.id);
  }
  const gone = (e: WireEnd) =>
    isJunctionEnd(e) ? junctions.has(e.junction) : blocks.has(e.block) || ports.some(p => p.block === e.block && p.id === e.port);
  data.wires = data.wires.filter(w => !wires.has(w.id) && !gone(w.a) && !gone(w.b));
  data.blocks = data.blocks.filter(b => !blocks.has(b.id));
  for (const p of ports) { const b = blockOf(data, p.block); if (b) b.ports = b.ports.filter(x => x.id !== p.id); }
  data.junctions = data.junctions.filter(j => !junctions.has(j.id));
  data.texts = data.texts.filter(t => !texts.has(t.id));
  data.frames = data.frames.filter(f => !frames.has(f.id));
  return data;
}

// ------------------------------------------------------------------ placement

/**
 * Top-left corner for a new w × h item near `centre` that does not overlap a block (with
 * `margin` around it): the centre itself if free, else the nearest free spot on rings of
 * `step`; `obstacles` adds other rectangles to keep clear of (wire segments, badges). V2 inserted at the view centre even on top of a block;
 * V3 keeps new items readable (CHANGELOG 3.25).
 */
export function freeSpot(d: BlockDiagram, w: number, h: number, centre: Point, step = 10, margin = 20,
  obstacles: readonly { x: number; y: number; w: number; h: number }[] = []): Point {
  const s = Math.max(1, step);
  const snap = (v: number) => Math.round(v / s) * s;
  const x0 = snap(centre.x - w / 2), y0 = snap(centre.y - h / 2);
  const boxes = [...d.blocks, ...obstacles];
  const free = (x: number, y: number) => boxes.every(b =>
    x + w + margin <= b.x || b.x + b.w + margin <= x || y + h + margin <= b.y || b.y + b.h + margin <= y);
  if (free(x0, y0)) return { x: x0, y: y0 };
  const ring = Math.max(2, Math.round(20 / s)) * s;
  for (let r = ring; r <= 60 * ring; r += ring) {
    const cands: Point[] = [];
    for (let k = -r; k <= r; k += ring) cands.push({ x: x0 + r, y: y0 + k }, { x: x0 + k, y: y0 + r }, { x: x0 - r, y: y0 + k }, { x: x0 + k, y: y0 - r });
    cands.sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0));
    const hit = cands.find(p => free(p.x, p.y));
    if (hit) return hit;
  }
  return { x: x0, y: y0 };
}
