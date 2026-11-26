// Undo / redo for one design's data (V2: past / future JSON snapshots per design, legacy
// L288 commit, L331–332 undo / redo).
//
// Differences from V2, on purpose:
//  - batch(fn) groups several changes into one undo step and rolls back if fn throws. V2 did
//    this by temporarily replacing the global commit() with a no-op (legacy L1348, L1648,
//    L3564), which leaked if anything else called commit meanwhile.
//  - undo and redo both mark the project dirty (V2 forgot redo until a later patch, L2322).

export interface HistoryOptions { limit?: number }

export class History<T> {
  private past: string[] = [];
  private future: string[] = [];
  private current: string;
  private batching = 0;
  private batchStart: string | null = null;
  private readonly limit: number;
  /** true when there are changes since the last markSaved() */
  dirty = false;
  private listeners = new Set<() => void>();

  constructor(initial: T, opts: HistoryOptions = {}) {
    this.current = JSON.stringify(initial);
    this.limit = Math.max(1, opts.limit ?? 200);
  }

  /** A fresh copy of the current state (callers may mutate it freely). */
  get present(): T { return JSON.parse(this.current) as T; }
  get canUndo(): boolean { return this.past.length > 0 && !this.batching; }
  get canRedo(): boolean { return this.future.length > 0 && !this.batching; }
  get undoDepth(): number { return this.past.length; }

  /** Record a new state. Identical consecutive states are not recorded. */
  commit(next: T): void {
    const s = JSON.stringify(next);
    if (s === this.current) return;
    if (!this.batching) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
      this.future = [];
    }
    this.current = s;
    this.dirty = true;
    if (!this.batching) this.emit();
  }

  /** Apply fn to a copy of the present state and commit the result. */
  update(fn: (draft: T) => void): void {
    const draft = this.present;
    fn(draft);
    this.commit(draft);
  }

  /**
   * Run fn as one undo step. Nested batches join the outer one. If fn throws, the state
   * returns to what it was before the batch and the error is rethrown.
   */
  batch<R>(fn: () => R): R {
    if (this.batching++ === 0) this.batchStart = this.current;
    const dirtyBefore = this.dirty;
    try {
      return fn();
    } catch (err) {
      if (this.batching === 1) { this.current = this.batchStart!; this.dirty = dirtyBefore; }
      throw err;
    } finally {
      if (--this.batching === 0) {
        const start = this.batchStart!;
        this.batchStart = null;
        if (start !== this.current) {
          this.past.push(start);
          if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
          this.future = [];
          this.emit();
        }
      }
    }
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.future.push(this.current);
    this.current = this.past.pop()!;
    this.dirty = true;
    this.emit();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    this.past.push(this.current);
    this.current = this.future.pop()!;
    this.dirty = true;
    this.emit();
    return true;
  }

  /**
   * Change a presentation setting without an undo step: fn is applied to the present state and
   * to every undo / redo snapshot, so undo neither reverts it nor is blocked by it. Marks dirty
   * when anything changed (step 3.27a: the block-diagram view is saved but not undoable).
   */
  amend(fn: (state: T) => T): boolean {
    if (this.batching) throw new Error('amend inside a batch');
    const apply = (s: string) => JSON.stringify(fn(JSON.parse(s) as T));
    const next = apply(this.current);
    if (next === this.current) return false;
    this.current = next;
    this.past = this.past.map(apply);
    this.future = this.future.map(apply);
    this.dirty = true;
    this.emit();
    return true;
  }

  /** Replace the state without an undo step (loading a file); clears history. */
  reset(state: T): void {
    this.current = JSON.stringify(state);
    this.past = [];
    this.future = [];
    this.dirty = false;
    this.emit();
  }

  markSaved(): void { this.dirty = false; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void { for (const fn of this.listeners) fn(); }
}
