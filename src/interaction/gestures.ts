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
import { routeWire, type Route } from '../router/full-path';
import { simplify } from '../core/geometry';
import type { Measure } from '../render/texts';
import { panBy, toWorld, wheelFactor, zoomAt } from '../core/camera';
import { gridSize, portPoint, snapIfOn } from '../core/grid';
import { connect, frameMembers, moveItems, updateFrame, FRAME } from '../model/diagram';

/** Screen px around a selected frame's corner that start a resize. */
export const FRAME_HANDLE = 8;
import { commitEdit, type CommitResult } from './commit';
import { hitTest, itemsInRect, nearestPort, normRect, SNAP_RADIUS, JUNCTION_HIT, type Rect } from './hit';

export interface PointerIn { x: number; y: number; button?: number; shift?: boolean; mod?: boolean; alt?: boolean }

export type Preview =
  | { kind: 'wire'; from: Point; to: Point; target: Point | null }
  | { kind: 'box'; rect: Rect };

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
    return this.state.kind === 'move' || this.state.kind === 'resize' ? this.state.draft : this.data();
  }

  isSelected(ref: Pick<ItemRef, 'kind' | 'id'>): boolean { return this.selection.some(s => s.kind === ref.kind && s.id === ref.id); }

  select(items: ItemRef[]): void {
    this.selection = items;
    const first = items[0];
    this.host.store.select(first && first.kind !== 'port' ? { kind: first.kind, id: first.id } as never : null);
    this.host.changed?.();
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
    const item = hitTest(d, world, { zoom: cam.z, routes: this.host.routes(), measure: this.host.measure });
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
      case 'resize':
      case 'move': {
        const out = s.kind === 'move' && this.host.adjustMove ? this.host.adjustMove(s.draft, s.ids) : s.draft;
        const r = commitEdit(this.host.store, () => out);
        if (!r.ok) this.host.refused?.(r);
        break;
      }
      case 'wire': {
        if (!s.target) break;
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
