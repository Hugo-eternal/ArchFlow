// Project state: the open project, its designs (each with its own undo history), the active
// design, the selection and the camera. The only way to change anything is through the
// methods below; the shell and every module read state and subscribe to changes
// (V2 kept all of this in globals: model, designs, activeDesignId, selection, camera).
import { History } from './history';
import { uid } from './ids';
import type { Camera, Design, DesignType, ProjectFile } from '../io/schema-types';
import { SCHEMA_VERSION } from '../io/schema-types';
import { APP_NAME, APP_VERSION } from '../version';
import { getLocale } from './i18n';

type DataOf<T extends DesignType> = Extract<Design, { type: T }>['data'];

export interface DesignEntry {
  id: string;
  name: string;
  type: DesignType;
  camera: Camera;
  history: History<Design['data']>;
}

export type Selection =
  | null
  | { kind: 'block' | 'wire' | 'junction' | 'text' | 'frame' | 'task' | 'link'; id: string };

export class Store {
  projectName = '';
  customStyles: ProjectFile['customStyles'] = [];
  private entries: DesignEntry[] = [];
  private activeId = '';
  selection: Selection = null;
  private listeners = new Set<() => void>();
  private unsubscribers = new Map<string, () => void>();

  // ------------------------------------------------------------------ reading
  get designs(): readonly DesignEntry[] { return this.entries; }
  get activeDesign(): DesignEntry | undefined { return this.entries.find(d => d.id === this.activeId); }
  get activeDesignId(): string { return this.activeId; }
  get dirty(): boolean { return this.entries.some(d => d.history.dirty) || this.metaDirty; }
  private metaDirty = false;

  /** Current data of a design (a copy). */
  data<T extends DesignType>(id: string, _type?: T): DataOf<T> {
    const e = this.entries.find(d => d.id === id);
    if (!e) throw new Error(`no design ${id}`);
    return e.history.present as DataOf<T>;
  }

  // ------------------------------------------------------------------ project
  /** Start a new project with one design. */
  newProject(name: string, first: { type: DesignType; name: string; data: Design['data'] }): void {
    this.clear();
    this.projectName = name;
    const id = this.addDesign(first.type, first.name, first.data, { activate: true });
    this.activeId = id;
    this.metaDirty = false;
    for (const e of this.entries) e.history.markSaved();
    this.emit();
  }

  /** Replace everything with a loaded project file (no undo history). */
  load(file: ProjectFile): void {
    this.clear();
    this.projectName = file.project.name;
    this.customStyles = structuredClone(file.customStyles);
    for (const d of file.designs) this.attach({ id: d.id, name: d.name, type: d.type, camera: { ...d.camera }, history: new History(d.data) });
    this.activeId = this.entries.some(d => d.id === file.activeDesignId) ? file.activeDesignId : this.entries[0]?.id ?? '';
    this.metaDirty = false;
    this.emit();
  }

  /** The project as a file (schemaVersion 3). */
  toFile(): ProjectFile {
    return {
      schemaVersion: SCHEMA_VERSION,
      app: `${APP_NAME} ${APP_VERSION}`,
      locale: getLocale(),
      project: { name: this.projectName },
      activeDesignId: this.activeId,
      customStyles: structuredClone(this.customStyles),
      designs: this.entries.map(e => ({ id: e.id, name: e.name, type: e.type, camera: { ...e.camera }, data: e.history.present }) as Design),
    };
  }

  markSaved(): void {
    this.metaDirty = false;
    for (const e of this.entries) e.history.markSaved();
    this.emit();
  }

  rename(name: string): void {
    if (name === this.projectName) return;
    this.projectName = name;
    this.metaDirty = true;
    this.emit();
  }

  // ------------------------------------------------------------------ designs
  addDesign(type: DesignType, name: string, data: Design['data'], opts: { activate?: boolean; id?: string } = {}): string {
    const id = opts.id ?? uid();
    if (this.entries.some(d => d.id === id)) throw new Error(`duplicate design id ${id}`);
    this.attach({ id, name, type, camera: { x: 0, y: 0, z: 1 }, history: new History(data) });
    if (opts.activate) { this.activeId = id; this.selection = null; }
    this.metaDirty = true;
    this.emit();
    return id;
  }

  removeDesign(id: string): void {
    const i = this.entries.findIndex(d => d.id === id);
    if (i < 0 || this.entries.length === 1) return; // a project always keeps one design
    this.unsubscribers.get(id)?.();
    this.unsubscribers.delete(id);
    this.entries.splice(i, 1);
    if (this.activeId === id) { this.activeId = this.entries[Math.max(0, i - 1)].id; this.selection = null; }
    this.metaDirty = true;
    this.emit();
  }

  renameDesign(id: string, name: string): void {
    const e = this.entries.find(d => d.id === id);
    if (!e || e.name === name) return;
    e.name = name;
    this.metaDirty = true;
    this.emit();
  }

  activate(id: string): void {
    if (id === this.activeId || !this.entries.some(d => d.id === id)) return;
    this.activeId = id;
    this.selection = null;
    this.emit();
  }

  // ------------------------------------------------------------------ editing the active design
  /** Change the active design's data as one undo step. */
  update(fn: (draft: Design['data']) => void): void {
    this.requireActive().history.update(fn);
  }

  /** Replace the active design's data as one undo step (no-op when unchanged). */
  commit(data: Design['data']): void {
    this.requireActive().history.commit(data);
  }

  /** Several updates as one undo step; rolled back if fn throws. */
  batch<R>(fn: () => R): R { return this.requireActive().history.batch(fn); }

  /** Change a presentation setting of the active design (e.g. its view): saved, marks the
   *  project unsaved, but is not an undo step (History.amend). */
  amend(fn: (data: Design['data']) => Design['data']): boolean {
    return this.requireActive().history.amend(fn);
  }

  /** New data for a design from an editor with its own undo (History.replace); any design, not only the active one. */
  setData(id: string, data: Design['data']): void {
    const e = this.entries.find(d => d.id === id);
    if (e) e.history.replace(data);
  }

  undo(): boolean { return this.activeDesign?.history.undo() ?? false; }
  redo(): boolean { return this.activeDesign?.history.redo() ?? false; }

  select(selection: Selection): void {
    this.selection = selection;
    this.emit();
  }

  setCamera(camera: Camera): void {
    const e = this.requireActive();
    e.camera = { ...camera };
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ------------------------------------------------------------------ internals
  private requireActive(): DesignEntry {
    const e = this.activeDesign;
    if (!e) throw new Error('no active design');
    return e;
  }

  private attach(e: DesignEntry): void {
    this.entries.push(e);
    this.unsubscribers.set(e.id, e.history.subscribe(() => this.emit()));
  }

  private clear(): void {
    for (const off of this.unsubscribers.values()) off();
    this.unsubscribers.clear();
    this.entries = [];
    this.activeId = '';
    this.selection = null;
    this.customStyles = [];
  }

  private emit(): void { for (const fn of this.listeners) fn(); }
}
