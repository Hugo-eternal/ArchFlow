// The commit step of a block-diagram edit. Every user action — a finished drag, a new wire, a
// deletion, an inspector change — goes through here exactly once:
//
//   1. with the grid on: core/grid.normalize (positions, sizes, port offsets on the grid) and
//      core/grid.protect (nothing locked moved) — V2 commit wrapper L1535;
//   2. router/junctions.cleanJunctions — V2 commit wrapper L1123;
//   3. one history entry (store.commit), so one Undo returns to the state before the action.
//
// When a lock refuses the edit, nothing is committed and the error code is returned for the
// shell to show (V2 showed "not applied; original preserved" and restored the model).
import type { BlockDiagram } from '../io/schema-types';
import { GridError, gridSize, normalize, protect } from '../core/grid';
import { cleanJunctions } from '../router/junctions';
import { ModelError } from '../model/types';
import type { Store } from '../core/store';

export type CommitResult =
  | { ok: true; data: BlockDiagram; changed: boolean }
  | { ok: false; error: GridError | ModelError };

/** Steps 1–2 on a proposed new state; pure. */
export function prepare(before: BlockDiagram, after: BlockDiagram): CommitResult {
  try {
    let data = after;
    if (data.grid?.snap) {
      data = normalize(data, gridSize(data.grid), { locks: true });
      protect(before, data);
    }
    data = cleanJunctions(data).data;
    return { ok: true, data, changed: JSON.stringify(data) !== JSON.stringify(before) };
  } catch (e) {
    if (e instanceof GridError || e instanceof ModelError) return { ok: false, error: e };
    throw e;
  }
}

/**
 * Apply `edit` (a pure model function) to the active block diagram and commit the result as
 * one undo step. The store is unchanged when the edit throws a model / grid error.
 */
export function commitEdit(store: Store, edit: (d: BlockDiagram) => BlockDiagram): CommitResult {
  const active = store.activeDesign;
  if (!active || (active.type !== 'function' && active.type !== 'power')) throw new Error('commitEdit needs a block diagram');
  const before = store.data(active.id) as BlockDiagram;
  let after: BlockDiagram;
  try { after = edit(before); } catch (e) {
    if (e instanceof ModelError || e instanceof GridError) return { ok: false, error: e };
    throw e;
  }
  const r = prepare(before, after);
  if (r.ok && r.changed) store.commit(r.data);
  return r;
}
