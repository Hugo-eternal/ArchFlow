// Pointer gestures on the block-diagram canvas, as a DOM-free state machine: the canvas feeds
// it pointer positions (screen px relative to the canvas) and it changes the camera, the
// selection and — once per finished gesture — the model through interaction/commit.
//
// While a move is in progress the model is not touched: `draft()` returns the moved diagram
// for drawing, and the result is committed on pointer-up (one undo step). Escape → cancel().
//
//   empty space        drag = pan; Shift-drag = box select (adds); click = clear selection
//   block / text / frame   click = select (Shift toggles); drag = move the selection
//   port               drag = new wire, dropped on a port or junction (22 px snap, V2 nearest)
//   junction           drag = new wire from it; Shift-drag = move it (V2: Shift moved junctions)
//   wire               click = select
//   frame              drag = move it with what is inside; a corner of the selected frame = resize
//   middle button      pan anywhere
//   wheel              zoom around the pointer (core/camera)
//
// V2: view / block / port / junction pointer handlers L317–321, finish L319, zoomAt L322–323.
import type { BlockDiagram, Camera, WireEnd } from '../io/schema-types';
import type { ItemRef } from '../model/types';
import type { Point } from '../core/geometry';
import type { Store } from '../core/store';
import { routeAll, routeWire, type Route } from '../router/full-path';
import { blockAt, connectToBody, nearestWirePoint, tapWire } from '../model/part-wiring';
import { simplify } from '../core/geometry';
import type { Measure } from '../render/texts';
import { panBy, toWorld, wheelFactor, zoomAt } from '../core/camera';
import { GridError, gridSize, portPoint, snapIfOn } from '../core/grid';
import { connect, frameMembers, moveItems, resizeBlock, updateFrame, FRAME } from '../model/diagram';
import { moveCorner, moveSegment, setLabelMark, setManualPath, slidePort, JOG } from '../model/route-edit';
import { labelBox, labelPosition, wireLabel } from '../render/wires';
import { ModelError } from '../model/types';

/** Screen px around a selected frame's corner that start a resize. */
export const FRAME_HANDLE = 8;
/** Screen px around the selected block's bottom-right corner that start a resize (a 24 px target, WCAG 2.5.8). */
export const BLOCK_HANDLE = 12;
import { commitEdit, type CommitResult } from './commit';
import { hitTest, itemsInRect, nearestPort, normRect, SNAP_RADIUS, JUNCTION_HIT, type Rect } from './hit';

export interface PointerIn { x: number; y: number; button?: number; shift?: boolean; mod?: boolean; alt?: boolean }

export type Preview =
  | { kind: 'wire'; from: Point; to: Point; target: Point | null }
  | { kind: 'box'; rect: Rect }
  | { kind: 'invalidPath'; points: Point[] };

export interface GestureHost {
  store: Store;
  camera(): Camera;
  setCamera(c: Camera): void;
  routes(): ReadonlyMap<string, Route>;
  measure?: Measure;
  /** Called whenever selection, preview or draft change (the canvas re-renders). */
  changed?(): void;
  /** Adjust a finished move before it is committed (e.g. connectors snapping to frame edges). */
  adjustMove?(d: BlockDiagram, movedIds: readonly string[]): BlockDiagram;
  /** A commit was refused (lock) or an edit failed. */
  refused?(r: Extract<CommitResult, { ok: false }>): void;
  /** Resizing a block also scales its text (V2.10 preference). */
  scaleText?(): boolean;
}

/** Movement below this many screen px is a click, not a drag. */
export const CLICK_SLOP = 3;
const MOVABLE = new Set<ItemRef['kind']>(['block', 'text', 'junction', 'frame']);

type State =
  | { kind: 'idle' }
  | { kind: 'pan'; start: PointerIn; camera: Camera }
  | { kind: 'box'; start: Point; additive: boolean; base: ItemRef[] }
  | { kind: 'press'; start: PointerIn; world: Point; item: ItemRef; shift: boolean }   // not yet a drag
  | { kind: 'move'; start: Point; ids: string[]; anchor: Point; before: BlockDiagram; draft: BlockDiagram }
  | { kind: 'resize'; frame: string; corner: string; start: Point; before: BlockDiagram; draft: BlockDiagram }
  | { kind: 'blockResize'; block: string; start: Point; before: BlockDiagram; draft: BlockDiagram }
  | { kind: 'path'; wire: string; ps: Point[]; index: number; corner: boolean; start: Point; before: BlockDiagram; draft: BlockDiagram; valid: boolean }
  | { kind: 'slide'; block: string; port: string; before: BlockDiagram; draft: BlockDiagram }
  | { kind: 'label'; wire: string; start: PointerIn; world: Point; pos: { x: number; y: number; angle: number }; before: BlockDiagram; draft: BlockDiagram; moved: boolean }
  | { kind: 'wire'; from: WireEnd; at: Point; to: Point; target: { end: WireEnd; at: Point } | null };

const same = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.id === b.id && (a.kind !== 'port' || (b.kind === 'port' && a.block === b.block));

export class Gestures {
  selection: ItemRef[] = [];
  preview: Preview | null = null;
  private state: State = { kind: 'idle' };

  constructor(private host: GestureHost) {}

  get busy(): boolean { return this.state.kind !== 'idle'; }

  /** The diagram to draw: the moving draft during a move, else the store's data. */
  draft(): BlockDiagram {
    const s = this.state;
    return s.kind === 'move' || s.kind === 'resize' || s.kind === 'blockResize' || s.kind === 'path' || s.kind === 'slide' || s.kind === 'label' ? s.draft : this.data();
  }

  isSelected(ref: Pick<ItemRef, 'kind' | 'id'>): boolean { return this.selection.some(s => s.kind === ref.kind && s.id === ref.id); }

  select(items: ItemRef[]): void {
    this.selection = items;
    const first = items[0];
    this.host.store.select(first && first.kind !== 'port' ? { kind: first.kind, id: first.id } as never : null);
    this.host.changed?.();
  }

  /**
   * A wire from a pin dropped on no pin (V2 af15-ux2 finish): onto a block's body when a part is
   * involved (a new pin, or the part's free lead), or a part's lead onto a wire (a junction).
   * The new route must be valid, else nothing changes and the user is told why.
   */
  private dropOnBody(from: WireEnd, at: Point): void {
    if (!('block' in from)) return;
    const d = this.data(), src = d.blocks.find(b => b.id === from.block);
    if (!src) return;
    const refuse = (id: string) => this.host.refused?.({ ok: false, error: new ModelError('route-invalid', id) });
    let next: BlockDiagram | null = null, wire = '';
    const target = blockAt(d, at, src.id);
    if (target) {
      const r = connectToBody(d, from, target.id, at);
      if (!r) return;
      if (!routeWire(r.data.wires.find(w => w.id === r.wire)!, r.data).valid) { refuse(r.wire); return; }
      next = r.data; wire = r.wire;
    } else if (src.part) {
      const g = d.grid?.snap ? gridSize(d.grid) : 10;
      const hit = nearestWirePoint(d, this.host.routes(), at, 12 / this.host.camera().z, g, src.id);
      if (!hit) return;
      const tap = tapWire(d, hit.wire, hit.at);
      const c = connect(tap.data, from, { junction: tap.junction }, { line: { arrow: false } });
      if (![...routeAll(c.data).values()].every(r => r.valid)) { refuse(hit.wire); return; }
      next = c.data; wire = c.id;
    }
    if (!next) return;
    const out = next;
    const r = commitEdit(this.host.store, () => out);
    if (!r.ok) { this.host.refused?.(r); return; }
    if (this.data().wires.some(w => w.id === wire)) this.select([{ kind: 'wire', id: wire }]);
  }

  /** The wire label under a point (its drawn box, turned with its angle), top-most first. */
  labelAt(d: BlockDiagram, p: Point, zoom: number): { wire: string; pos: { x: number; y: number; angle: number } } | null {
    const routes = this.host.routes(), pad = 3 / zoom;
    for (let i = d.wires.length - 1; i >= 0; i--) {
      const w = d.wires[i], r = routes.get(w.id), text = r ? wireLabel(w, d.view) : '';
      const pos = text ? labelPosition(w, r!.ps) : null;
      if (!pos) continue;
      const box = labelBox(w, pos, text, this.host.measure);
      // undo the label's rotation around its anchor, then test the plain box
      const a = -((pos.angle ?? 0) * Math.PI) / 180, dx = p.x - pos.x, dy = p.y - pos.y;
      const q = { x: pos.x + dx * Math.cos(a) - dy * Math.sin(a), y: pos.y + dx * Math.sin(a) + dy * Math.cos(a) };
      if (q.x >= box.x - pad && q.x <= box.x + box.w + pad && q.y >= box.y - pad && q.y <= box.y + box.h + pad) {
        const cx = pos.anchor === 'middle' ? pos.x : box.x + box.w / 2;
        return { wire: w.id, pos: { x: cx, y: pos.y, angle: pos.angle ?? 0 } };
      }
    }
    return null;
  }

  /** The path of a wire as drawn, its corner points (bends) and segment midpoints (handles). */
  wireHandles(id: string): { points: Point[]; corners: Point[]; segments: Point[] } {
    const points = simplify(this.host.routes().get(id)?.ps ?? []);
    return {
      points,
      corners: points.slice(1, -1),
      segments: points.slice(1).map((p, i) => ({ x: (points[i].x + p.x) / 2, y: (points[i].y + p.y) / 2 })),
    };
  }

  // ---------------------------------------------------------------- pointer
  down(ev: PointerIn): void {
    if (this.state.kind !== 'idle') this.cancel();
    const cam = this.host.camera(), world = toWorld(cam, ev);
    if (ev.button === 1) { this.state = { kind: 'pan', start: ev, camera: cam }; return; }
    const d = this.data();
    // a corner handle of the one selected frame resizes it (V2 grip L4372)
    const only = this.selection.length === 1 && this.selection[0].kind === 'frame' ? d.frames.find(f => f.id === this.selection[0].id) : undefined;
    if (only && !ev.shift) {
      const tol = FRAME_HANDLE / cam.z;
      for (const [c, x, y] of [['nw', only.x, only.y], ['ne', only.x + only.w, only.y], ['sw', only.x, only.y + only.h], ['se', only.x + only.w, only.y + only.h]] as const) {
        if (Math.abs(world.x - x) <= tol && Math.abs(world.y - y) <= tol) {
          this.state = { kind: 'resize', frame: only.id, corner: c, start: world, before: d, draft: d };
          return;
        }
      }
    }
    // the bottom-right corner of the one selected block resizes it (V2.9 / V2.10 .resize grip)
    const one = this.selection.length === 1 && this.selection[0].kind === 'block' ? d.blocks.find(b => b.id === this.selection[0].id) : undefined;
    if (one && !one.locked && !one.part && !one.connector && !ev.shift) {
      const tol = BLOCK_HANDLE / cam.z;
      if (Math.abs(world.x - one.x - one.w) <= tol && Math.abs(world.y - one.y - one.h) <= tol) {
        this.state = { kind: 'blockResize', block: one.id, start: world, before: d, draft: d };
        return;
      }
    }
    // the corners and segments of the one selected wire (V2 rc48 corner handles, grid segment drag)
    const wsel = this.selection.length === 1 && this.selection[0].kind === 'wire' ? d.wires.find(w => w.id === this.selection[0].id) : undefined;
    if (wsel && !wsel.locked && !ev.shift) {
      const ps = this.wireHandles(wsel.id);
      // the drawn handle (10 px) first, the wider 24 px target only where no label is
      const within = (tol: number) => (p: Point) => Math.abs(world.x - p.x) <= tol / cam.z && Math.abs(world.y - p.y) <= tol / cam.z;
      const pick = (tol: number) => { const c = ps.corners.findIndex(within(tol)); return { corner: c, segment: c < 0 ? ps.segments.findIndex(within(tol)) : -1 }; };
      let { corner, segment } = pick(6);
      if (corner < 0 && segment < 0 && !this.labelAt(d, world, cam.z)) ({ corner, segment } = pick(BLOCK_HANDLE));
      if (corner >= 0 || segment >= 0) {
        this.state = { kind: 'path', wire: wsel.id, ps: ps.points, index: corner >= 0 ? corner + 1 : segment, corner: corner >= 0, start: world, before: d, draft: d, valid: true };
        return;
      }
    }
    // a wire label: drag it to pin it by hand (V2 v4 marks, L1806); a click selects the wire
    const label = this.labelAt(d, world, cam.z);
    if (label && !ev.shift) {
      const w = d.wires.find(x => x.id === label.wire)!;
      this.select([{ kind: 'wire', id: w.id }]);
      if (w.locked) { this.host.refused?.({ ok: false, error: new GridError('locked-wire', w.id) }); return; }
      this.state = { kind: 'label', wire: w.id, start: ev, world, pos: label.pos, before: d, draft: d, moved: false };
      return;
    }
    const item = hitTest(d, world, { zoom: cam.z, routes: this.host.routes(), measure: this.host.measure });
    // Shift-drag a pin: slide it along the block edge (V2 project / gg port drag)
    if (item?.kind === 'port' && ev.shift) {
      const b = d.blocks.find(x => x.id === item.block)!, p = b.ports.find(x => x.id === item.id)!;
      if (!b.locked && !p.locked && !b.part && !b.connector) {
        this.select([{ kind: 'block', id: b.id }]);
        this.state = { kind: 'slide', block: b.id, port: p.id, before: d, draft: d };
        return;
      }
    }
    if (!item) {
      if (ev.shift) this.state = { kind: 'box', start: world, additive: true, base: [...this.selection] };
      else this.state = { kind: 'pan', start: ev, camera: cam };
      return;
    }
    if (item.kind === 'port') {
      const b = d.blocks.find(x => x.id === item.block)!, p = b.ports.find(x => x.id === item.id)!;
      const at = portPoint(b, p, d.grid?.snap ? gridSize(d.grid) : undefined);
      this.state = { kind: 'wire', from: { block: item.block, port: item.id }, at, to: world, target: null };
      this.updateWirePreview();
      return;
    }
    if (item.kind === 'junction' && !ev.shift) {
      const j = d.junctions.find(x => x.id === item.id)!;
      this.state = { kind: 'wire', from: { junction: j.id }, at: { x: j.x, y: j.y }, to: world, target: null };
      this.select([item]);
      this.updateWirePreview();
      return;
    }
    this.state = { kind: 'press', start: ev, world, item, shift: !!ev.shift };
  }

  move(ev: PointerIn): void {
    const cam = this.host.camera(), world = toWorld(cam, ev), s = this.state;
    switch (s.kind) {
      case 'pan':
        this.host.setCamera(panBy(s.camera, ev.x - s.start.x, ev.y - s.start.y));
        return;
      case 'box': {
        const rect = normRect(s.start, world);
        const inside = itemsInRect(this.data(), rect, this.host.measure);
        this.selection = s.additive ? [...s.base, ...inside.filter(i => !s.base.some(b => same(b, i)))] : inside;
        this.preview = { kind: 'box', rect };
        this.host.changed?.();
        return;
      }
      case 'press': {
        if (Math.hypot(ev.x - s.start.x, ev.y - s.start.y) < CLICK_SLOP) return;
        if (!MOVABLE.has(s.item.kind)) return;          // wires are not dragged here
        if (!this.isSelected(s.item)) this.select(s.shift ? [...this.selection, s.item] : [s.item]);
        const before = this.data();
        const ids = this.selection.filter(i => MOVABLE.has(i.kind)).map(i => i.id);
        // a frame carries what is inside it (V2 grab L4352)
        for (const f of this.selection.filter(i => i.kind === 'frame')) for (const m of frameMembers(before, f.id)) if (!ids.includes(m)) ids.push(m);
        this.state = { kind: 'move', start: s.world, ids, anchor: this.anchorOf(before, s.item), before, draft: before };
        this.move(ev);
        return;
      }
      case 'move': {
        // snap the grabbed item's new position; everything else moves by the same delta (V2 snap)
        const g = s.before.grid;
        const nx = snapIfOn(s.anchor.x + world.x - s.start.x, g), ny = snapIfOn(s.anchor.y + world.y - s.start.y, g);
        s.draft = moveItems(s.before, s.ids, nx - s.anchor.x, ny - s.anchor.y);
        this.host.changed?.();
        return;
      }
      case 'wire':
        s.to = world;
        this.updateWirePreview();
        return;
      case 'path': {
        const g = s.before.grid?.snap ? gridSize(s.before.grid) : 1;
        const S = (v: number) => Math.round(v / g) * g;
        let next: Point[] | null;
        if (s.corner) next = moveCorner(s.ps, s.index, { x: S(world.x), y: S(world.y) });
        else {
          const a = s.ps[s.index], b = s.ps[s.index + 1], hz = Math.abs(a.y - b.y) < 1e-6;
          next = moveSegment(s.ps, s.index, S(hz ? world.y - s.start.y : world.x - s.start.x), g > 1 ? g : JOG);
        }
        if (!next) return;
        const draft = setManualPath(s.before, s.wire, next);
        const w = draft.wires.find(x => x.id === s.wire)!;
        // an invalid hand path falls back to auto-routing (router/full-path): it must come back unchanged
        const r = routeWire(w, draft);
        s.valid = r.valid && JSON.stringify(simplify(r.ps)) === JSON.stringify(simplify(next));
        s.draft = s.valid ? draft : s.before;
        this.preview = s.valid ? null : { kind: 'invalidPath', points: next };
        this.host.changed?.();
        return;
      }
      case 'label': {
        if (!s.moved && Math.hypot(ev.x - s.start.x, ev.y - s.start.y) < CLICK_SLOP) return;
        s.moved = true;
        const mark = { x: Math.round((s.pos.x + world.x - s.world.x) * 100) / 100, y: Math.round((s.pos.y + world.y - s.world.y) * 100) / 100, angle: s.pos.angle };
        s.draft = setLabelMark(s.before, s.wire, mark);
        this.host.changed?.();
        return;
      }
      case 'slide': {
        const g = s.before.grid?.snap ? gridSize(s.before.grid) : 1;
        s.draft = slidePort(s.before, s.block, s.port, world, g);
        this.host.changed?.();
        return;
      }
      case 'blockResize': {
        const b = s.before.blocks.find(x => x.id === s.block)!;
        s.draft = resizeBlock(s.before, s.block, b.w + world.x - s.start.x, b.h + world.y - s.start.y, { scaleText: this.host.scaleText?.() ?? false, theme: s.before.theme });
        this.host.changed?.();
        return;
      }
      case 'resize': {
        const f = s.before.frames.find(x => x.id === s.frame)!, g = s.before.grid;
        const S = (v: number) => snapIfOn(v, g), dx = world.x - s.start.x, dy = world.y - s.start.y;
        let { x, y, w, h } = f;
        if (s.corner.includes('w')) { const nx = Math.min(S(f.x + dx), f.x + f.w - FRAME.minW); w = f.x + f.w - nx; x = nx; } else w = Math.max(FRAME.minW, S(f.w + dx));
        if (s.corner.includes('n')) { const ny = Math.min(S(f.y + dy), f.y + f.h - FRAME.minH); h = f.y + f.h - ny; y = ny; } else h = Math.max(FRAME.minH, S(f.h + dy));
        s.draft = updateFrame(s.before, s.frame, { x, y, w, h });
        this.host.changed?.();
        return;
      }
    }
  }

  up(ev: PointerIn): void {
    const s = this.state;
    this.state = { kind: 'idle' };
    this.preview = null;
    switch (s.kind) {
      case 'pan':
        if (Math.hypot(ev.x - s.start.x, ev.y - s.start.y) < CLICK_SLOP && s.start.button !== 1) this.select([]);
        break;
      case 'box':
        this.select(this.selection);
        break;
      case 'press':
        if (s.shift) this.select(this.isSelected(s.item) ? this.selection.filter(i => !same(i, s.item)) : [...this.selection, s.item]);
        else this.select([s.item]);
        break;
      case 'path': {
        // V2: "the target intersects a block or creates an invalid route" — nothing changes
        if (!s.valid) { this.host.refused?.({ ok: false, error: new ModelError('route-invalid', s.wire) }); break; }
        const r = commitEdit(this.host.store, () => s.draft);
        if (!r.ok) this.host.refused?.(r);
        break;
      }
      case 'label': {
        if (!s.moved) break;
        const r = commitEdit(this.host.store, () => s.draft);
        if (!r.ok) this.host.refused?.(r);
        break;
      }
      case 'resize':
      case 'blockResize':
      case 'slide':
      case 'move': {
        const out = s.kind === 'move' && this.host.adjustMove ? this.host.adjustMove(s.draft, s.ids) : s.draft;
        const r = commitEdit(this.host.store, () => out);
        if (!r.ok) this.host.refused?.(r);
        break;
      }
      case 'wire': {
        if (!s.target) { this.dropOnBody(s.from, s.to); break; }
        let id = '';
        const r = commitEdit(this.host.store, d => { const c = connect(d, s.from, s.target!.end); id = c.id; return c.data; });
        if (!r.ok) this.host.refused?.(r);
        else if (this.data().wires.some(w => w.id === id)) this.select([{ kind: 'wire', id }]);
        break;
      }
    }
    this.host.changed?.();
  }

  /** Abandon the gesture in progress (Escape); the model is untouched. */
  cancel(): void {
    const s = this.state;
    if (s.kind === 'pan') this.host.setCamera(s.camera);
    if (s.kind === 'box') this.selection = s.base;
    this.state = { kind: 'idle' };
    this.preview = null;
    this.host.changed?.();
  }

  wheel(deltaY: number, at: Point): void {
    const cam = this.host.camera();
    this.host.setCamera(zoomAt(cam, cam.z * wheelFactor(deltaY), at));
  }

  /**
   * Points of the wire being drawn: the real route once a target is under the pointer (V2
   * grid preview L1566), else an L shape to the (snapped) pointer.
   */
  previewPoints(): Point[] {
    const s = this.state;
    if (s.kind !== 'wire') return [];
    const d = this.data();
    if (s.target) {
      const tmp = { id: '__preview', a: s.from, b: s.target.end, name: '', kind: 'signal', line: { color: '', width: 2, dash: 'solid', arrow: false }, locked: false };
      return routeWire(tmp, d, []).ps;
    }
    const to = { x: snapIfOn(s.to.x, d.grid), y: snapIfOn(s.to.y, d.grid) };
    return simplify([s.at, { x: to.x, y: s.at.y }, to]);
  }

  // ---------------------------------------------------------------- internals
  private data(): BlockDiagram {
    const a = this.host.store.activeDesign;
    if (!a) throw new Error('no active design');
    return this.host.store.data(a.id) as BlockDiagram;
  }

  private anchorOf(d: BlockDiagram, item: ItemRef): Point {
    const list = item.kind === 'block' ? d.blocks : item.kind === 'text' ? d.texts : item.kind === 'junction' ? d.junctions : d.frames;
    const it = (list as { id: string; x: number; y: number }[]).find(x => x.id === item.id)!;
    return { x: it.x, y: it.y };
  }

  private updateWirePreview(): void {
    const s = this.state;
    if (s.kind !== 'wire') return;
    const d = this.data(), z = this.host.camera().z;
    const skip = 'block' in s.from ? s.from : undefined;
    const port = nearestPort(d, s.to, SNAP_RADIUS / z, skip);
    let target: { end: WireEnd; at: Point } | null = port ? { end: { block: port.block, port: port.port }, at: port.at } : null;
    if (!target) {
      const j = d.junctions.find(j => Math.hypot(j.x - s.to.x, j.y - s.to.y) <= Math.max(JUNCTION_HIT, SNAP_RADIUS) / z && !('junction' in s.from && s.from.junction === j.id));
      if (j) target = { end: { junction: j.id }, at: { x: j.x, y: j.y } };
    }
    s.target = target;
    this.preview = { kind: 'wire', from: s.at, to: target?.at ?? s.to, target: target?.at ?? null };
    this.host.changed?.();
  }
}
