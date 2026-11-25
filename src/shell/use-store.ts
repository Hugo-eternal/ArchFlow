// The store as React state: components re-render when the store (or another source with the
// same subscribe shape) emits. No state library (plan §1.5: useSyncExternalStore).
import { useSyncExternalStore } from 'react';

interface Source { subscribe(fn: () => void): () => void }

const versions = new WeakMap<Source, number>();

/** A number that changes on every emit of `source`; use it as an effect / memo dependency. */
export function useVersion(source: Source): number {
  return useSyncExternalStore(
    fn => source.subscribe(() => { versions.set(source, (versions.get(source) ?? 0) + 1); fn(); }),
    () => versions.get(source) ?? 0,
  );
}

/** A tiny emitter for shell-only state (selection, messages, open dialogs). */
export class Emitter implements Source {
  private fns = new Set<() => void>();
  subscribe(fn: () => void): () => void { this.fns.add(fn); return () => this.fns.delete(fn); }
  emit(): void { for (const fn of [...this.fns]) fn(); }
}
