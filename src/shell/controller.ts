// Shell state and commands, without React: the open screen, messages, dialogs, the canvas
// gestures and the command registry. React components (shell/*.tsx) only read this and call
// `run(commandId)`; every edit goes through core/commands → model → interaction/commit
// (plan §1.2 rule 5 — V2 clicked hidden buttons instead, audit §4.1).
import { CommandRegistry, type Command } from '../core/commands';
import { Store } from '../core/store';
import { t, type MessageKey, type Vars } from '../core/i18n';
import { fit, toWorld, unionBounds, zoomBy, IDENTITY, type Viewport } from '../core/camera';
import { GridError, gridSize } from '../core/grid';
import type { BlockDiagram, BlockView, Camera, DesignType } from '../io/schema-types';
import type { DesignModule, DesignRegistry } from '../designs/module';
import { ModelError } from '../model/types';
import { addBlock, addFrame, addPort, addText, BLOCK_DEFAULT, FRAME, freeSpot, makeBlock, TEXT_DEFAULT } from '../model/diagram';
import { routeAll, type Route } from '../router/full-path';
import { estimateWidth, type Measure } from '../render/texts';
import { Gestures } from '../interaction/gestures';
import { canvasCommands } from '../interaction/commands';
import { commitEdit, type CommitResult } from '../interaction/commit';
import { downloadText, openMessage, readProjectBlob, saveProject, type OpenResult } from '../io/project-file';
import { Emitter } from './use-store';

export type Screen = 'start' | 'workspace';
export interface Message { key: MessageKey; vars?: Vars; tone: 'info' | 'error' }
export type Dialog =
  | null
  | { kind: 'export' }
  | { kind: 'newDesign' }
  | { kind: 'prompt'; title: MessageKey; label: MessageKey; value: string; ok: (value: string) => void }
  | { kind: 'confirm'; title: MessageKey; message: MessageKey; vars?: Vars; ok: () => void };

type Refusal = Extract<CommitResult, { ok: false }>;

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** i18n text for a refused edit. */
export function refusalText(r: Refusal): string {
  const code = r.error instanceof GridError || r.error instanceof ModelError ? r.error.code : '';
  const known: Record<string, MessageKey> = {
    'locked-block': 'canvas.refused.locked-block', 'locked-port': 'canvas.refused.locked-port', 'locked-wire': 'canvas.refused.locked-wire',
  };
  const reason: MessageKey = known[code] ?? (code.startsWith('limit') ? 'canvas.refused.limit' : 'canvas.refused.other');
  return t('canvas.refused', { reason: t(reason) });
}

/** What a new design starts from: a type and, optionally, one of its templates. */
export interface DesignChoice { type: DesignType; template?: string; name?: string }

export class Shell {
  readonly store = new Store();
  readonly registry = new CommandRegistry<Shell>();
  readonly ui = new Emitter();
  readonly gestures: Gestures;
  screen: Screen = 'start';
  message: Message | null = null;
  dialog: Dialog = null;
  inspectorOpen = true;
  viewport: Viewport = { w: 800, h: 600 };
  measure: Measure = estimateWidth;
  /** Fit the view once the canvas knows its size (new design from a template, opened file). */
  pendingFit = false;
  /** Set by the canvas: open the browser's file picker. */
  pickFile: () => void = () => {};
  private routeCache: { data: BlockDiagram | null; routes: Map<string, Route> } = { data: null, routes: new Map() };

  constructor(readonly designs: DesignRegistry) {
    this.gestures = new Gestures({
      store: this.store,
      camera: () => this.camera,
      setCamera: c => this.store.setCamera(c),
      routes: () => this.routesFor(this.gestures.draft()),
      measure: this.measure,
      changed: () => this.ui.emit(),
      adjustMove: (d, ids) => this.module?.afterMove?.(d, ids) ?? d,
      refused: r => this.refused(r),
    });
    this.registry.registerAll(canvasCommands() as unknown as Command<Shell>[]);
    this.registry.registerAll(shellCommands());
    for (const m of designs.list()) if (m.commands) this.registry.registerAll(m.commands as unknown as Command<Shell>[]);
  }

  // ------------------------------------------------------------------ reading
  get camera(): Camera { return this.store.activeDesign?.camera ?? IDENTITY; }
  /** The strategy of the active design. */
  get module(): DesignModule | undefined { const d = this.store.activeDesign; return d ? this.designs.get(d.type) : undefined; }
  get isBlockDiagram(): boolean { return !!this.module?.blockDiagram; }
  data(): BlockDiagram { return this.store.data(this.store.activeDesignId) as BlockDiagram; }
  routesFor(d: BlockDiagram): Map<string, Route> {
    if (this.routeCache.data !== d) this.routeCache = { data: d, routes: routeAll(d) };
    return this.routeCache.routes;
  }

  // ------------------------------------------------------------------ actions
  run(id: string, arg?: unknown): Promise<boolean> { return this.registry.run(id, this, arg); }
  enabled(id: string): boolean { return this.registry.isEnabled(id, this); }

  notify(key: MessageKey, vars?: Vars, tone: Message['tone'] = 'info'): void { this.message = { key, vars, tone }; this.ui.emit(); }
  refused(r: Refusal): void { this.message = { key: 'canvas.refused.text', vars: { text: refusalText(r) }, tone: 'error' }; this.ui.emit(); }
  openDialog(d: Dialog): void { this.dialog = d; this.ui.emit(); }
  closeDialog(): void { this.dialog = null; this.ui.emit(); }
  setViewport(v: Viewport): void { this.viewport = v; }

  /** A new project with one design (blank or from a template). */
  newProject(name: string, choice: DesignChoice = { type: this.designs.list()[0].type }): void {
    const made = this.designs.require(choice.type).create({ template: choice.template });
    const designName = choice.name?.trim() || made.name || t('design.defaultName', { n: 1 });
    this.store.newProject(name.trim() || t('project.untitled'), { type: choice.type, name: designName, data: made.data });
    this.gestures.select([]);
    this.screen = 'workspace';
    this.message = null;
    this.pendingFit = !!choice.template;
    this.ui.emit();
  }

  /** Add a design to the open project and switch to it. */
  addDesign(choice: DesignChoice): void {
    const made = this.designs.require(choice.type).create({ template: choice.template });
    const name = choice.name?.trim() || made.name || t('design.defaultName', { n: this.store.designs.length + 1 });
    this.gestures.cancel();
    this.gestures.select([]);
    this.store.addDesign(choice.type, name, made.data, { activate: true });
    this.pendingFit = !!choice.template;
    this.dialog = null;
    this.ui.emit();
  }

  async openBlob(file: Blob): Promise<OpenResult> {
    const r = await readProjectBlob(file);
    if (r.ok) {
      this.store.load(r.file);
      this.gestures.select([]);
      this.screen = 'workspace';
      this.pendingFit = false;
      this.notify('file.opened');
    } else {
      this.notify(openMessage(r), r.reason === 'invalid' ? { count: r.errors.length } : undefined, 'error');
    }
    return r;
  }

  /** Centre of the visible canvas in diagram coordinates. */
  viewCentre(): { x: number; y: number } { return toWorld(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 }); }

  fitView(): void {
    if (!this.isBlockDiagram) return;
    const d = this.data();
    const rects = [...d.blocks, ...d.frames, ...d.texts.map(x => ({ x: x.x, y: x.y, w: x.w, h: 40 }))];
    const c = fit(unionBounds(rects, d.junctions), this.viewport);
    if (c) this.store.setCamera(c);
  }

  /** The active block diagram's view ('function' when it is not a block diagram). */
  get view(): BlockView { return this.isBlockDiagram ? this.data().view : 'function'; }

  /** Switch the view: only the drawing changes; saved with the file (marks it unsaved), not an undo step. */
  setView(view: BlockView): void {
    if (!this.isBlockDiagram || this.view === view) return;
    this.store.amend(d => ({ ...(d as BlockDiagram), view }));
    this.notify(view === 'power' ? 'view.mode.powerOn' : 'view.mode.functionOn');
  }

  edit(fn: (d: BlockDiagram) => BlockDiagram): CommitResult {
    const r = commitEdit(this.store, fn);
    if (!r.ok) this.refused(r);
    return r;
  }
}

const hasProject = (s: Shell) => s.screen === 'workspace' && !!s.store.activeDesign;
const canEdit = (s: Shell) => hasProject(s) && s.isBlockDiagram && !s.gestures.busy;

function confirmDiscard(s: Shell, then: () => void): void {
  if (!s.store.dirty) { then(); return; }
  s.openDialog({ kind: 'confirm', title: 'project.discard.title', message: 'project.discard.message', ok: then });
}

export function shellCommands(): Command<Shell>[] {
  return [
    { id: 'project.new', label: 'cmd.projectNew', group: 'project', run: s => confirmDiscard(s, () => { s.screen = 'start'; s.dialog = null; s.ui.emit(); }) },
    { id: 'project.open', label: 'cmd.projectOpen', group: 'project', shortcut: 'Mod+O', run: s => confirmDiscard(s, () => { s.closeDialog(); s.pickFile(); }) },
    {
      id: 'project.save', label: 'cmd.projectSave', group: 'project', shortcut: 'Mod+S', enabled: hasProject,
      run: s => { const f = saveProject(s.store); downloadText(f.name, f.text); s.notify('file.saved', { name: f.name }); },
    },
    {
      id: 'design.add', label: 'cmd.designAdd', group: 'design', enabled: hasProject,
      run: s => s.openDialog({ kind: 'newDesign' }),
    },
    {
      id: 'design.rename', label: 'cmd.designRename', group: 'design', enabled: hasProject,
      run: s => {
        const d = s.store.activeDesign!;
        s.openDialog({ kind: 'prompt', title: 'cmd.designRename', label: 'design.name', value: d.name, ok: name => { if (name.trim()) s.store.renameDesign(d.id, name.trim()); s.closeDialog(); } });
      },
    },
    {
      id: 'design.delete', label: 'cmd.designDelete', group: 'design', enabled: s => hasProject(s) && s.store.designs.length > 1,
      run: s => {
        const d = s.store.activeDesign!;
        s.openDialog({ kind: 'confirm', title: 'cmd.designDelete', message: 'design.deleteConfirm', vars: { name: d.name }, ok: () => { s.store.removeDesign(d.id); s.gestures.select([]); s.closeDialog(); } });
      },
    },
    {
      id: 'design.switch', label: 'cmd.designSwitch', group: 'design', enabled: hasProject,
      run: (s, id) => { if (typeof id === 'string' && id !== s.store.activeDesignId) { s.gestures.cancel(); s.gestures.select([]); s.store.activate(id); } },
    },
    {
      id: 'block.add', label: 'cmd.blockAdd', group: 'insert', shortcut: 'B', enabled: canEdit,
      run: s => {
        const d = s.data(), c = s.viewCentre();
        const at = freeSpot(d, BLOCK_DEFAULT.w, BLOCK_DEFAULT.h, c, d.grid.snap ? gridSize(d.grid) : 1);
        let id = '';
        const r = s.edit(x => { const out = addBlock(x, makeBlock(x, at)); id = out.id; return out.data; });
        if (r.ok) s.gestures.select([{ kind: 'block', id }]);
      },
    },
    {
      id: 'port.add', label: 'cmd.portAdd', group: 'insert', shortcut: 'P',
      enabled: s => canEdit(s) && s.gestures.selection.length === 1 && s.gestures.selection[0].kind === 'block',
      run: s => {
        const block = s.gestures.selection[0].id;
        let id = '';
        const r = s.edit(x => { const out = addPort(x, block, 'io'); id = out.id; return out.data; });
        if (r.ok) s.gestures.select([{ kind: 'port', block, id }]);
      },
    },
    {
      id: 'text.add', label: 'cmd.textAdd', group: 'insert', shortcut: 'T', enabled: canEdit,
      run: s => {
        const c = s.viewCentre();
        let id = '';
        const r = s.edit(x => { const out = addText(x, { x: c.x - TEXT_DEFAULT.w / 2, y: c.y - 20 }, t('text.placeholder')); id = out.id; return out.data; });
        if (r.ok) s.gestures.select([{ kind: 'text', id }]);
      },
    },
    {
      id: 'frame.add', label: 'cmd.frameAdd', group: 'insert', enabled: canEdit,
      run: s => {
        // around the selection (V2 draws by dragging; V3 frames what is selected, else a default box)
        const d = s.data(), sel = s.gestures.selection;
        const boxes = [
          ...d.blocks.filter(b => sel.some(i => i.kind === 'block' && i.id === b.id)),
          ...d.texts.filter(x => sel.some(i => i.kind === 'text' && i.id === x.id)).map(x => ({ x: x.x, y: x.y, w: x.w, h: 24 })),
        ];
        const g = d.grid.snap ? gridSize(d.grid) : 10, S = (v: number) => Math.round(v / g) * g;
        let rect: { x: number; y: number; w: number; h: number };
        if (boxes.length) {
          const x1 = S(Math.min(...boxes.map(b => b.x)) - FRAME.pad), y1 = S(Math.min(...boxes.map(b => b.y)) - FRAME.pad - 10);
          rect = { x: x1, y: y1, w: S(Math.max(...boxes.map(b => b.x + b.w)) + FRAME.pad) - x1, h: S(Math.max(...boxes.map(b => b.y + b.h)) + FRAME.pad) - y1 };
        } else {
          const c = s.viewCentre();
          rect = { x: S(c.x - FRAME.defaultW / 2), y: S(c.y - FRAME.defaultH / 2), w: FRAME.defaultW, h: FRAME.defaultH };
        }
        let id = '';
        const r = s.edit(x => { const out = addFrame(x, rect, t('frame.defaultName', { n: x.frames.length + 1 })); id = out.id; return out.data; });
        if (r.ok) s.gestures.select([{ kind: 'frame', id }]);
      },
    },
    { id: 'view.fit', label: 'cmd.viewFit', group: 'view', shortcut: 'F', enabled: hasProject, run: s => s.fitView() },
    { id: 'view.zoomIn', label: 'cmd.zoomIn', group: 'view', shortcut: 'Mod+=', enabled: hasProject, run: s => s.store.setCamera(zoomBy(s.camera, 1.2, s.viewport)) },
    { id: 'view.zoomOut', label: 'cmd.zoomOut', group: 'view', shortcut: 'Mod+-', enabled: hasProject, run: s => s.store.setCamera(zoomBy(s.camera, 1 / 1.2, s.viewport)) },
    { id: 'view.mode.function', label: 'view.mode.function', group: 'view-mode', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.setView('function') },
    { id: 'view.mode.power', label: 'view.mode.power', group: 'view-mode', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.setView('power') },
    {
      id: 'view.mode.toggle', label: 'view.mode.toggle', group: 'view', shortcut: 'Shift+V', enabled: s => hasProject(s) && s.isBlockDiagram && !s.gestures.busy,
      run: s => s.setView(s.view === 'power' ? 'function' : 'power'),
    },
    { id: 'view.toggleInspector', label: 'cmd.toggleInspector', group: 'view', enabled: hasProject, run: s => { s.inspectorOpen = !s.inspectorOpen; s.ui.emit(); } },
    { id: 'export.open', label: 'cmd.exportOpen', group: 'project', shortcut: 'Mod+E', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.openDialog({ kind: 'export' }) },
  ];
}
