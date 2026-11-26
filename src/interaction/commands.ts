// Keyboard / menu commands of the block-diagram canvas. Registered by the shell into its
// CommandRegistry; every edit goes through interaction/commit (one undo step).
// V2: keydown handler L326 (Escape, Delete, arrows), undo / redo L330–331, removeSelection L329.
import type { Command } from '../core/commands';
import type { Store } from '../core/store';
import type { BlockDiagram } from '../io/schema-types';
import type { ItemRef } from '../model/types';
import { moveItems, remove } from '../model/diagram';
import { gridSize } from '../core/grid';
import { commitEdit, type CommitResult } from './commit';
import type { Gestures } from './gestures';

export interface CanvasContext {
  store: Store;
  gestures: Gestures;
  /** An editor with its own undo (embedded vendor editors, 3.30): undo / redo go there. */
  embeddedHistory?(): { undo(): void; redo(): void; canUndo(): boolean; canRedo(): boolean } | null;
  refused?(r: Extract<CommitResult, { ok: false }>): void;
}

const isBlockDiagram = (c: CanvasContext) => c.store.activeDesign?.type === 'function';
const data = (c: CanvasContext) => c.store.data(c.store.activeDesignId) as BlockDiagram;
const editable = (c: CanvasContext) => isBlockDiagram(c) && !c.gestures.busy;

function run(c: CanvasContext, edit: (d: BlockDiagram) => BlockDiagram): void {
  const r = commitEdit(c.store, edit);
  if (!r.ok) c.refused?.(r);
}

/** Arrow keys move the selection one grid cell (1 px without the grid); with Shift ten. */
function nudge(dx: number, dy: number, id: string, label: Command<CanvasContext>['label'], key: string, big: boolean): Command<CanvasContext> {
  return {
    id, label, group: 'edit', shortcut: big ? `Shift+${key}` : key,
    enabled: c => editable(c) && c.gestures.selection.some(i => i.kind !== 'wire' && i.kind !== 'port'),
    run: c => {
      const d = data(c), step = (d.grid?.snap ? gridSize(d.grid) : 1) * (big ? 10 : 1);
      run(c, x => moveItems(x, c.gestures.selection.map(i => i.id), dx * step, dy * step));
    },
  };
}

export function canvasCommands(): Command<CanvasContext>[] {
  return [
    {
      id: 'history.undo', label: 'cmd.undo', group: 'edit', shortcut: 'Mod+Z',
      enabled: c => { const e = c.embeddedHistory?.(); return e ? e.canUndo() : !c.gestures.busy && !!c.store.activeDesign?.history.canUndo; },
      run: c => { const e = c.embeddedHistory?.(); if (e) { e.undo(); return; } c.store.undo(); c.gestures.select([]); },
    },
    {
      id: 'history.redo', label: 'cmd.redo', group: 'edit', shortcut: ['Mod+Shift+Z', 'Mod+Y'],
      enabled: c => { const e = c.embeddedHistory?.(); return e ? e.canRedo() : !c.gestures.busy && !!c.store.activeDesign?.history.canRedo; },
      run: c => { const e = c.embeddedHistory?.(); if (e) { e.redo(); return; } c.store.redo(); c.gestures.select([]); },
    },
    {
      id: 'selection.delete', label: 'cmd.delete', group: 'edit', shortcut: ['Delete', 'Backspace'],
      enabled: c => editable(c) && c.gestures.selection.length > 0,
      run: c => { const items = [...c.gestures.selection]; run(c, d => remove(d, items)); c.gestures.select([]); },
    },
    {
      id: 'selection.selectAll', label: 'cmd.selectAll', group: 'edit', shortcut: 'Mod+A',
      enabled: c => editable(c),
      run: c => {
        const d = data(c);
        c.gestures.select([
          ...d.blocks.map(b => ({ kind: 'block', id: b.id }) as ItemRef), ...d.texts.map(t => ({ kind: 'text', id: t.id }) as ItemRef),
          ...d.junctions.map(j => ({ kind: 'junction', id: j.id }) as ItemRef), ...d.frames.map(f => ({ kind: 'frame', id: f.id }) as ItemRef),
          ...d.wires.map(w => ({ kind: 'wire', id: w.id }) as ItemRef),
        ]);
      },
    },
    {
      id: 'selection.clear', label: 'cmd.clearSelection', group: 'edit', shortcut: 'Escape',
      enabled: c => isBlockDiagram(c),
      run: c => { if (c.gestures.busy) c.gestures.cancel(); else c.gestures.select([]); },
    },
    ...([[-1, 0, 'Left'], [1, 0, 'Right'], [0, -1, 'Up'], [0, 1, 'Down']] as const).flatMap(([dx, dy, dir]) => [
      nudge(dx, dy, `selection.nudge${dir}`, `cmd.nudge${dir}`, `Arrow${dir}`, false),
      nudge(dx, dy, `selection.nudge${dir}Big`, `cmd.nudge${dir}`, `Arrow${dir}`, true),
    ]),
  ];
}
