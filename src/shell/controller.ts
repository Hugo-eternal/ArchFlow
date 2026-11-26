// Shell state and commands, without React: the open screen, messages, dialogs, the canvas
// gestures and the command registry. React components (shell/*.tsx) only read this and call
// `run(commandId)`; every edit goes through core/commands → model → interaction/commit
// (plan §1.2 rule 5 — V2 clicked hidden buttons instead, audit §4.1).
import { CommandRegistry, type Command } from '../core/commands';
import { Store } from '../core/store';
import { t, type MessageKey, type Vars } from '../core/i18n';
import { centreOn, fit, toWorld, unionBounds, zoomBy, IDENTITY, type Viewport } from '../core/camera';
import { GridError, gridSize } from '../core/grid';
import type { BlockDiagram, BlockView, Camera, Design, DesignType } from '../io/schema-types';
import type { CanvasSelection, DesignModule, DesignRegistry, EmbeddedApi, FindItem } from '../designs/module';
import { frameApi, installHosts, installToolHosts } from './embedded';
import { ToolRegistry } from '../tools/module';
import type { Selection } from '../core/store';
import { ModelError, type ItemRef } from '../model/types';
import { addBlock, addFrame, addPort, addText, adoptNewBlock, clearRoutes, BLOCK_DEFAULT, FRAME, freeSpot, makeBlock, setPortLabelMode, TEXT_DEFAULT, updateBlock, updateWire } from '../model/diagram';
import { routeAll, type Route } from '../router/full-path';
import { alignable, alignBlocks, arrangePorts, type AlignAxis } from '../model/arrange';
import { estimateWidth, type Measure } from '../render/texts';
import { Gestures } from '../interaction/gestures';
import { canvasCommands } from '../interaction/commands';
import { commitEdit, type CommitResult } from '../interaction/commit';
import { downloadText, openMessage, readProjectBlob, saveProject, type OpenResult } from '../io/project-file';
import { Emitter } from './use-store';
import { scaleTextOn } from '../core/prefs';

export type Screen = 'start' | 'workspace';
export interface Message { key: MessageKey; vars?: Vars; tone: 'info' | 'error' }
/** A notification shown over the workspace (V2 af2-toast): at most 3, newest last. */
export interface Toast extends Message { id: number }
export const TOAST_MAX = 3;
let toastSeq = 0;
export type Dialog =
  | null
  | { kind: 'export' }
  | { kind: 'organize' }
  | { kind: 'palette' }
  | { kind: 'alignGrid' }
  | { kind: 'fonts' }
  | { kind: 'help' }
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
    'route-invalid': 'canvas.refused.route-invalid',
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
  toasts: Toast[] = [];
  dialog: Dialog = null;
  inspectorOpen = true;
  /** The project contents panel on the left (V2 "project contents"). */
  explorerOpen = true;
  viewport: Viewport = { w: 800, h: 600 };
  measure: Measure = estimateWidth;
  /** Fit the view once the canvas knows its size (new design from a template, opened file). */
  pendingFit = false;
  /** The mounted vendor editor frame (embedded designs), set by the canvas. */
  frame: HTMLIFrameElement | null = null;
  /** The vendor editor's status line (e.g. "all rails up after 42 ms") and warning. */
  embeddedStatus = { text: '', warn: '' };
  private frameReady = false;
  /** Set by the canvas: open the browser's file picker. */
  pickFile: () => void = () => {};
  /** Focus a field of the properties panel by key (set by the panel; false when not shown). */
  focusField: (key: string) => boolean = () => false;
  private routeCache: { data: BlockDiagram | null; routes: Map<string, Route> } = { data: null, routes: new Map() };

  /** The tool shown over the shell (V2 af2-tooldlg), and the tools opened so far (their frames stay mounted). */
  tool: string | null = null;
  openedTools: string[] = [];
  /** Commands run from the palette, most recent first (V2 palette "Recent"; not saved). */
  recentCommands: string[] = [];

  constructor(readonly designs: DesignRegistry, readonly tools: ToolRegistry = new ToolRegistry()) {
    this.gestures = new Gestures({
      store: this.store,
      camera: () => this.camera,
      setCamera: c => this.store.setCamera(c),
      routes: () => this.routesFor(this.gestures.draft()),
      measure: this.measure,
      changed: () => this.ui.emit(),
      adjustMove: (d, ids) => this.module?.afterMove?.(d, ids) ?? d,
      refused: r => this.refused(r),
      scaleText: scaleTextOn,
    });
    installHosts(this, typeof window !== 'undefined' ? window : ({} as Window));
    installToolHosts(this, typeof window !== 'undefined' ? window : ({} as Window));
    this.registry.registerAll(canvasCommands() as unknown as Command<Shell>[]);
    this.registry.registerAll(shellCommands());
    for (const m of designs.list()) if (m.commands) this.registry.registerAll(m.commands as unknown as Command<Shell>[]);
    this.registry.registerAll(tools.list().map(tl => ({ id: `tool.open.${tl.id}`, label: tl.label, group: 'tools', run: (s: Shell) => s.openTool(tl.id) })));
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

  notify(key: MessageKey, vars?: Vars, tone: Message['tone'] = 'info'): void {
    this.message = { key, vars, tone };
    this.toasts = [...this.toasts, { ...this.message, id: ++toastSeq }].slice(-TOAST_MAX);
    this.ui.emit();
  }
  refused(r: Refusal): void { this.notify('canvas.refused.text', { text: refusalText(r) }, 'error'); }
  dismissToast(id: number): void {
    if (!this.toasts.some(x => x.id === id)) return;
    this.toasts = this.toasts.filter(x => x.id !== id);
    this.ui.emit();
  }
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
    this.toasts = [];
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
      this.toasts = [];
      this.notify('file.opened');
    } else {
      this.notify(openMessage(r), r.reason === 'invalid' ? { count: r.errors.length } : undefined, 'error');
    }
    return r;
  }

  /** Centre of the visible canvas in diagram coordinates. */
  viewCentre(): { x: number; y: number } { return toWorld(this.camera, { x: this.viewport.w / 2, y: this.viewport.h / 2 }); }

  fitView(): void {
    const drawing = this.module?.canvas;
    if (drawing) {
      const b = drawing.bounds(this.store.data(this.store.activeDesignId));
      const c = b && fit(b, this.viewport);
      if (c) this.store.setCamera(c);
      return;
    }
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

  rememberCommand(id: string): void {
    this.recentCommands = [id, ...this.recentCommands.filter(x => x !== id)].slice(0, 5);
  }

  /** Select a palette item (block, task) and centre the view on it (V2 D.reveal). */
  reveal(item: FindItem): void {
    if (this.isBlockDiagram) this.gestures.select([item.select as ItemRef]);
    else this.selectItem(item.select);
    this.store.setCamera(centreOn(this.camera, item.at, this.viewport));
    this.ui.emit();
  }

  /** Show a tool over the shell; its frame stays mounted after closing (V2 kept it, hidden). */
  openTool(id: string): void {
    if (!this.tools.get(id)) return;
    if (!this.openedTools.includes(id)) this.openedTools = [...this.openedTools, id];
    this.tool = id;
    this.ui.emit();
  }
  closeTool(): void { if (this.tool) { this.tool = null; this.ui.emit(); } }

  setEmbeddedStatus(text: string, warn: string): void { this.embeddedStatus = { text, warn }; this.ui.emit(); }
  embeddedReady(): void { this.frameReady = true; this.ui.emit(); }
  /** Called by the canvas when it mounts / drops the frame. */
  setFrame(frame: HTMLIFrameElement | null): void { this.frame = frame; this.frameReady = false; this.embeddedStatus = { text: '', warn: '' }; this.ui.emit(); }

  /** Undo / redo of an embedded design go to its editor (V2 routed Ctrl+Z into the frame). */
  embeddedHistory(): EmbeddedApi | null { return this.module?.embedded && this.frameReady ? frameApi(this) : null; }

  /** The selected item of a canvas design that draws itself (null when none or gone after undo). */
  get item(): CanvasSelection | null {
    const sel = this.store.selection as CanvasSelection | null, c = this.module?.canvas;
    if (!sel || !c) return null;
    return !c.exists || c.exists(this.store.data(this.store.activeDesignId), sel) ? sel : null;
  }

  selectItem(sel: CanvasSelection | null): void { this.store.select(sel as Selection); this.ui.emit(); }

  /** One undo step on the active design's data (canvas designs that draw themselves). */
  editDesign(fn: (d: Design['data']) => Design['data']): boolean {
    const id = this.store.activeDesignId, before = this.store.data(id);
    let after: Design['data'];
    try { after = fn(before); } catch (e) {
      const key = this.module?.canvas?.refusal?.(e);
      if (key) { this.notify(key, undefined, 'error'); return false; }
      throw e;
    }
    if (JSON.stringify(after) !== JSON.stringify(before)) this.store.commit(after);
    return true;
  }

  edit(fn: (d: BlockDiagram) => BlockDiagram): CommitResult {
    const r = commitEdit(this.store, fn);
    if (!r.ok) this.refused(r);
    return r;
  }
}

const hasProject = (s: Shell) => s.screen === 'workspace' && !!s.store.activeDesign;
const selectedBlocks = (s: Shell) => s.gestures.selection.filter(i => i.kind === 'block').map(i => i.id);
/** The id of the one selected block-diagram item of this kind, or null. */
const oneOf = (s: Shell, kind: ItemRef['kind']): string | null => {
  const sel = s.isBlockDiagram ? s.gestures.selection : [];
  return sel.length === 1 && sel[0].kind === kind ? sel[0].id : null;
};

/** The panel field holding the selected item's name (V2 eo(bu()): the name / label / title box). */
function nameField(s: Shell): string | null {
  if (!hasProject(s)) return null;
  if (!s.isBlockDiagram) return s.item?.kind === 'task' ? 'title' : null;
  const sel = s.gestures.selection;
  if (sel.length !== 1) return null;
  return sel[0].kind === 'block' ? 'partNumber' : sel[0].kind === 'wire' || sel[0].kind === 'port' ? 'name' : sel[0].kind === 'text' ? 'text' : null;
}

/** V2 "block style" quick colours (L168145 presets: fill, border, accent; the text colour reset). */
export const BLOCK_PRESETS = [
  { name: 'standard', fill: '#FFFFFF', border: '#A9B4C0', accent: '#3A4A5C' },
  { name: 'mistBlue', fill: '#F3F6FA', border: '#A9BBCF', accent: '#2B5C8A' },
  { name: 'mistGreen', fill: '#F3F7F5', border: '#A8C3B9', accent: '#2E6E62' },
  { name: 'sand', fill: '#F9F6F0', border: '#D1BE9C', accent: '#9A6A26' },
  { name: 'slate', fill: '#F1F3F5', border: '#B3BCC6', accent: '#5B6876' },
  { name: 'ink', fill: '#1F2A37', border: '#1F2A37', accent: '#8DB0D3' },
] as const;

/** V2 wire quick colours (inspector .af15-wire swatches). */
export const WIRE_COLORS = ['#44546A', '#2B5C8A', '#2E6E62', '#9A6A26', '#A33A32', '#5B5394', '#7A8694', '#1C2733'] as const;

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
    // the start screen's form (V2 #createProject, its "load examples" box = a template choice)
    {
      id: 'project.create', label: 'start.create', group: 'project', enabled: s => s.screen === 'start',
      run: (s, arg) => { const a = (arg ?? {}) as { name?: string; choice?: DesignChoice }; s.newProject(a.name ?? '', a.choice); },
    },
    {
      id: 'project.newFromExamples', label: 'cmd.projectFromExample', group: 'project', enabled: s => s.screen === 'start',
      run: (s, arg) => { const m = s.designs.list()[0]; s.newProject(typeof arg === 'string' ? arg : '', { type: m.type, template: m.templates[0]?.id }); },
    },
    // back to the open project from the start screen (V2 #startCancel)
    {
      id: 'project.cancelNew', label: 'start.cancel', group: 'project', enabled: s => s.screen === 'start' && !!s.store.activeDesign,
      run: s => { s.screen = 'workspace'; s.ui.emit(); },
    },
    {
      id: 'project.rename', label: 'cmd.projectRename', group: 'project', enabled: hasProject,
      run: s => s.openDialog({
        kind: 'prompt', title: 'cmd.projectRename', label: 'start.projectName', value: s.store.projectName,
        ok: name => { if (name.trim()) s.store.rename(name.trim().slice(0, 100)); s.closeDialog(); },
      }),
    },
    {
      id: 'design.duplicate', label: 'cmd.designDuplicate', group: 'design', enabled: hasProject,
      run: s => {
        const d = s.store.activeDesign!;
        s.gestures.cancel();
        s.gestures.select([]);
        s.store.addDesign(d.type, t('design.copyName', { name: d.name }), JSON.parse(JSON.stringify(s.store.data(d.id))), { activate: true });
        s.pendingFit = true;
        s.ui.emit();
      },
    },
    // V2 #examplesBtn: a design from a template, through the new-design dialog
    { id: 'design.loadExample', label: 'cmd.designFromExample', group: 'design', enabled: hasProject, run: s => s.openDialog({ kind: 'newDesign' }) },
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
        const r = s.edit(x => { const out = addBlock(x, makeBlock(x, at)); id = out.id; return adoptNewBlock(out.data, id); });
        if (r.ok) s.gestures.select([{ kind: 'block', id }]);
      },
    },
    {
      id: 'port.add', label: 'cmd.portAdd', group: 'insert', shortcut: 'P',
      enabled: s => canEdit(s) && s.gestures.selection.length === 1 && s.gestures.selection[0].kind === 'block',
      // with a type ('in' / 'out' / 'io', the selection bar) the block stays selected, as V2's "+ input"
      run: (s, arg) => {
        const block = s.gestures.selection[0].id;
        let id = '';
        const type = arg === 'in' || arg === 'out' || arg === 'io' ? arg : null;
        const r = s.edit(x => { const out = addPort(x, block, type ?? 'io'); id = out.id; return out.data; });
        if (r.ok && !type) s.gestures.select([{ kind: 'port', block, id }]);
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
    // V2 #reroute: drop the manual route of the selected wires, or of every wire when none is selected
    {
      id: 'wire.reroute', label: 'cmd.wireReroute', group: 'wire', enabled: s => canEdit(s) && s.data().wires.length > 0,
      run: s => {
        const ids = s.gestures.selection.filter(i => i.kind === 'wire').map(i => i.id);
        const r = s.edit(x => clearRoutes(x, ids.length ? ids : undefined));
        if (!r.ok) return;
        const invalid = [...s.routesFor(s.data()).values()].filter(x => !x.valid).length;
        if (invalid) s.notify('wire.rerouteInvalid', { count: invalid }, 'error'); else s.notify('wire.rerouted');
      },
    },
    // selection bar (V2 .af2-selbar, 3.46d2): edit the name in the panel, quick colours, line type, arrow
    {
      id: 'item.rename', label: 'cmd.itemRename', group: 'edit', shortcut: 'F2',
      enabled: s => !!nameField(s),
      run: s => { const key = nameField(s); if (key) { s.inspectorOpen = true; s.ui.emit(); setTimeout(() => s.focusField(key), 0); } },
    },
    {
      id: 'item.delete', label: 'cmd.delete', group: 'edit',
      enabled: s => hasProject(s) && (s.isBlockDiagram ? s.enabled('selection.delete') : !!s.item && !!s.module?.canvas?.remove),
      run: s => {
        if (s.isBlockDiagram) { void s.run('selection.delete'); return; }
        const sel = s.item, remove = s.module?.canvas?.remove;
        if (sel && remove && s.editDesign(d => remove(d, sel))) s.selectItem(null);
      },
    },
    {
      id: 'block.stylePreset', label: 'cmd.blockStylePreset', group: 'edit',
      enabled: s => canEdit(s) && !!oneOf(s, 'block'),
      run: (s, arg) => {
        const p = BLOCK_PRESETS[typeof arg === 'number' ? arg : 0], id = oneOf(s, 'block');
        if (!p || !id) return;
        s.edit(d => { const b = d.blocks.find(x => x.id === id)!; const style = { ...b.style, fill: p.fill, border: p.border, accent: p.accent }; delete style.text; return updateBlock(d, id, { style }); });
      },
    },
    {
      id: 'wire.color', label: 'cmd.wireColor', group: 'wire', enabled: s => canEdit(s) && !!oneOf(s, 'wire'),
      run: (s, arg) => { const id = oneOf(s, 'wire'); if (id && typeof arg === 'string') s.edit(d => updateWire(d, id, { line: { ...d.wires.find(w => w.id === id)!.line, color: arg } })); },
    },
    {
      id: 'wire.dash', label: 'cmd.wireDash', group: 'wire', enabled: s => canEdit(s) && !!oneOf(s, 'wire'),
      run: (s, arg) => { const id = oneOf(s, 'wire'); if (id && typeof arg === 'string') s.edit(d => updateWire(d, id, { line: { ...d.wires.find(w => w.id === id)!.line, dash: arg } })); },
    },
    {
      id: 'wire.arrow', label: 'cmd.wireArrow', group: 'wire', enabled: s => canEdit(s) && !!oneOf(s, 'wire'),
      run: s => { const id = oneOf(s, 'wire'); if (id) s.edit(d => { const line = d.wires.find(w => w.id === id)!.line; return updateWire(d, id, { line: { ...line, arrow: !line.arrow } }); }); },
    },
    // V2 drawing settings "port names inside / outside" (afPinLabels): every shown pin name, one undo step
    {
      id: 'layout.portLabels', label: 'cmd.portLabels', group: 'layout', enabled: canEdit,
      run: (s, arg) => {
        const mode = arg === 'outside' ? 'outside' : 'inside';
        if (s.edit(d => setPortLabelMode(d, mode)).ok) s.notify(mode === 'inside' ? 'toast.portLabelsInside' : 'toast.portLabelsOutside');
      },
    },
    // V2 #rcClearRoutes: clear the wire selection (the routing scope), without deleting anything
    {
      id: 'wire.clearRoutes', label: 'cmd.wireClearSelection', group: 'wire',
      enabled: s => canEdit(s) && s.gestures.selection.some(i => i.kind === 'wire'),
      run: s => s.gestures.select(s.gestures.selection.filter(i => i.kind !== 'wire')),
    },
    // V2 "Align / Grid" panel (#workspaceManage) and "Layout and fonts" dialog (#chineseFont / #englishFont)
    { id: 'design.manage', label: 'cmd.alignGrid', group: 'layout', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.openDialog({ kind: 'alignGrid' }) },
    { id: 'theme.fonts', label: 'cmd.fonts', group: 'layout', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.openDialog({ kind: 'fonts' }) },
    ...(['horizontal', 'vertical'] as AlignAxis[]).map((axis): Command<Shell> => ({
      id: axis === 'horizontal' ? 'layout.alignHorizontal' : 'layout.alignVertical', label: axis === 'horizontal' ? 'cmd.alignHorizontal' : 'cmd.alignVertical', group: 'layout',
      enabled: s => canEdit(s) && alignable(s.data(), selectedBlocks(s)).length >= 2,
      run: s => { const r = s.edit(d => alignBlocks(d, selectedBlocks(s), axis)?.data ?? d); if (r.ok) s.notify('align.done'); },
    })),
    // V2 afArrangeSelectedIO: the selected block's pins by where their wires go
    {
      id: 'layout.arrangeSelectedPorts', label: 'cmd.arrangePorts', group: 'layout',
      enabled: s => { if (!canEdit(s)) return false; const ids = selectedBlocks(s); const b = ids.length === 1 ? s.data().blocks.find(x => x.id === ids[0]) : undefined; return !!b && !b.locked && b.ports.some(p => !p.locked); },
      run: s => { const id = selectedBlocks(s)[0]; const r = s.edit(d => arrangePorts(d, id)); if (r.ok) s.notify('ports.arranged'); },
    },
    // the organize dialog (V2 RC4 v4Open): compare candidates, apply one as a single undo step
    { id: 'layout.arrangePreview', label: 'cmd.organize', group: 'view', enabled: s => canEdit(s) && s.store.data(s.store.activeDesignId) !== undefined, run: s => s.openDialog({ kind: 'organize' }) },
    // V2 af2-palette (Ctrl+K) and the shortcuts / help sheet (Ctrl+?, V2 #helpBtn)
    { id: 'palette.open', label: 'cmd.palette', group: 'help', shortcut: 'Mod+K', enabled: hasProject, run: s => s.openDialog({ kind: 'palette' }) },
    { id: 'help.open', label: 'cmd.help', group: 'help', shortcut: 'Mod+?', run: s => s.openDialog({ kind: 'help' }) },
    { id: 'view.fit', label: 'cmd.viewFit', group: 'view', shortcut: 'F', enabled: hasProject, run: s => s.fitView() },
    { id: 'view.zoomIn', label: 'cmd.zoomIn', group: 'view', shortcut: 'Mod+=', enabled: hasProject, run: s => s.store.setCamera(zoomBy(s.camera, 1.2, s.viewport)) },
    { id: 'view.zoomOut', label: 'cmd.zoomOut', group: 'view', shortcut: 'Mod+-', enabled: hasProject, run: s => s.store.setCamera(zoomBy(s.camera, 1 / 1.2, s.viewport)) },
    { id: 'view.mode.function', label: 'view.mode.function', group: 'view-mode', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.setView('function') },
    { id: 'view.mode.power', label: 'view.mode.power', group: 'view-mode', enabled: s => hasProject(s) && s.isBlockDiagram, run: s => s.setView('power') },
    {
      id: 'view.mode.toggle', label: 'view.mode.toggle', group: 'view', shortcut: 'Shift+V', enabled: s => hasProject(s) && s.isBlockDiagram && !s.gestures.busy,
      run: s => s.setView(s.view === 'power' ? 'function' : 'power'),
    },
    { id: 'view.toggleExplorer', label: 'cmd.toggleExplorer', group: 'view', enabled: s => hasProject(s) && !!s.module?.outline, run: s => { s.explorerOpen = !s.explorerOpen; s.ui.emit(); } },
    { id: 'view.toggleInspector', label: 'cmd.toggleInspector', group: 'view', enabled: hasProject, run: s => { s.inspectorOpen = !s.inspectorOpen; s.ui.emit(); } },
    { id: 'export.open', label: 'cmd.exportOpen', group: 'project', shortcut: 'Mod+E', enabled: s => hasProject(s) && (s.isBlockDiagram || !!s.module?.canvas || !!s.embeddedHistory()?.openExport),
      // an embedded editor has its own export dialog (V2 openExport)
      run: s => { const api = s.module?.embedded ? s.embeddedHistory() : null; if (api?.openExport) api.openExport(); else s.openDialog({ kind: 'export' }); } },
  ];
}
