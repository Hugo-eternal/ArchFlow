// module: core — V3 src/core/history.ts and src/core/store.ts.
import { describe, it, expect, vi } from 'vitest';
import { History } from '../../src/core/history';
import { Store } from '../../src/core/store';
import type { BlockDiagram } from '../../src/io/schema-types';

type S = { n: number; items: string[] };
const h0 = () => new History<S>({ n: 0, items: [] });

describe('History', () => {
  it('undo / redo walk back and forth; a new commit clears redo', () => {
    const h = h0();
    h.update(s => { s.n = 1; });
    h.update(s => { s.n = 2; });
    expect(h.undo()).toBe(true);
    expect(h.present.n).toBe(1);
    expect(h.redo()).toBe(true);
    expect(h.present.n).toBe(2);
    h.undo();
    h.update(s => { s.n = 9; });
    expect(h.canRedo).toBe(false);
    expect(h.undo() && h.present.n).toBe(1);
    expect(h.undo() && h.present.n).toBe(0);
    expect(h.undo()).toBe(false);
  });

  it('present is a copy: mutating it changes nothing', () => {
    const h = h0();
    h.present.items.push('x');
    expect(h.present.items).toEqual([]);
    expect(h.canUndo).toBe(false);
  });

  it('identical consecutive states are not recorded', () => {
    const h = h0();
    h.update(() => {});
    h.commit({ n: 0, items: [] });
    expect(h.undoDepth).toBe(0);
    expect(h.dirty).toBe(false);
  });

  it('batch groups changes into one step (replaces V2 "commit = no-op" swaps, L1348/L1648/L3564)', () => {
    const h = h0();
    const seen = vi.fn();
    h.subscribe(seen);
    h.batch(() => {
      h.update(s => { s.n = 1; });
      h.update(s => { s.items.push('a'); });
      h.batch(() => h.update(s => { s.items.push('b'); })); // nested joins the outer batch
      expect(h.canUndo).toBe(false);                         // no partial undo while batching
    });
    expect(h.present).toEqual({ n: 1, items: ['a', 'b'] });
    expect(h.undoDepth).toBe(1);
    expect(seen).toHaveBeenCalledTimes(1);
    h.undo();
    expect(h.present).toEqual({ n: 0, items: [] });
  });

  it('a failing batch rolls back and leaves no undo step', () => {
    const h = h0();
    h.update(s => { s.n = 5; });
    h.markSaved();
    expect(() => h.batch(() => { h.update(s => { s.n = 6; }); throw new Error('boom'); })).toThrow('boom');
    expect(h.present.n).toBe(5);
    expect(h.undoDepth).toBe(1);
    expect(h.dirty).toBe(false);
  });

  it('a batch that changes nothing adds no step', () => {
    const h = h0();
    h.batch(() => h.update(() => {}));
    expect(h.undoDepth).toBe(0);
  });

  it('keeps at most `limit` undo steps', () => {
    const h = new History<S>({ n: 0, items: [] }, { limit: 3 });
    for (let i = 1; i <= 10; i++) h.update(s => { s.n = i; });
    expect(h.undoDepth).toBe(3);
    while (h.undo());
    expect(h.present.n).toBe(7);
  });

  it('dirty: set by commit, undo and redo (V2 fixed redo late, L2322); cleared by markSaved and reset', () => {
    const h = h0();
    h.update(s => { s.n = 1; });
    expect(h.dirty).toBe(true);
    h.markSaved();
    h.undo();
    expect(h.dirty).toBe(true);
    h.markSaved();
    h.redo();
    expect(h.dirty).toBe(true);
    h.reset({ n: 3, items: [] });
    expect([h.dirty, h.canUndo, h.canRedo, h.present.n]).toEqual([false, false, false, 3]);
  });
});

const emptyDiagram = (): BlockDiagram => ({ view: 'function', blocks: [], wires: [], junctions: [], texts: [], frames: [], grid: { size: 10, show: true, snap: true }, wirePresets: [], presentationClean: false });

describe('Store', () => {
  const make = () => {
    const s = new Store();
    s.newProject('P', { type: 'function', name: 'F', data: emptyDiagram() });
    return s;
  };

  it('a new project has one active, clean design', () => {
    const s = make();
    expect(s.designs.map(d => [d.name, d.type])).toEqual([['F', 'function']]);
    expect(s.activeDesign?.name).toBe('F');
    expect(s.dirty).toBe(false);
  });

  it('designs keep separate histories; switching clears the selection', () => {
    const s = make();
    const f = s.activeDesignId;
    s.update(d => { (d as BlockDiagram).texts.push({ id: 't', text: 'a', x: 0, y: 0, w: 10, size: 12, color: '#000', bold: false, italic: false, align: 'left', background: 'transparent' }); });
    const p = s.addDesign('function', 'P1', emptyDiagram(), { activate: true });
    expect(s.activeDesignId).toBe(p);
    s.select({ kind: 'block', id: 'x' });
    s.activate(f);
    expect(s.selection).toBeNull();
    expect((s.data(f) as BlockDiagram).texts).toHaveLength(1);
    expect((s.data(p) as BlockDiagram).texts).toHaveLength(0);
    expect(s.undo()).toBe(true);           // undoes the text in F only
    expect((s.data(f) as BlockDiagram).texts).toHaveLength(0);
    s.activate(p);
    expect(s.undo()).toBe(false);
  });

  it('a project always keeps at least one design; removing the active one activates a neighbour', () => {
    const s = make();
    s.removeDesign(s.activeDesignId);
    expect(s.designs).toHaveLength(1);
    const a = s.activeDesignId;
    const b = s.addDesign('schedule', 'S', { tasks: [], links: [], texts: [], rules: { endpoint: 'start', count: 'difference' }, appearance: {}, snap: { enabled: true, range: 12 } }, { activate: true });
    s.removeDesign(b);
    expect(s.activeDesignId).toBe(a);
  });

  it('dirty tracks data, names and design list; markSaved clears all', () => {
    const s = make();
    s.rename('Q');
    expect(s.dirty).toBe(true);
    s.markSaved();
    s.update(d => { (d as BlockDiagram).grid.size = 20; });
    expect(s.dirty).toBe(true);
    s.markSaved();
    expect(s.dirty).toBe(false);
  });

  it('toFile → load round-trips and starts without undo history', () => {
    const s = make();
    s.update(d => { (d as BlockDiagram).grid.size = 20; });
    s.addDesign('function', 'P1', emptyDiagram());
    const file = s.toFile();
    expect(file.schemaVersion).toBe(3);
    expect(file.app).toMatch(/^ArchFlow 3\./);
    const t = new Store();
    t.load(JSON.parse(JSON.stringify(file)));
    expect(t.toFile()).toEqual(file);
    expect(t.dirty).toBe(false);
    expect(t.undo()).toBe(false);
  });

  it('batch on the store is one undo step and notifies once', () => {
    const s = make();
    const seen = vi.fn();
    s.subscribe(seen);
    s.batch(() => { s.update(d => { (d as BlockDiagram).grid.size = 20; }); s.update(d => { (d as BlockDiagram).grid.show = false; }); });
    expect(seen).toHaveBeenCalledTimes(1);
    s.undo();
    expect((s.data(s.activeDesignId) as BlockDiagram).grid).toEqual({ size: 10, show: true, snap: true });
  });
});
