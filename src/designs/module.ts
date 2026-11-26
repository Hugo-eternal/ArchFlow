// The design strategy interface (docs/v3-plan.md §2.5) and its registry. Shared modules (shell,
// export, inspector frame) ask the registry for a design's module instead of testing its type
// (V2 wrapped functions with `if (isSchedule())`, audit §1). Each designs/<type>/index.ts
// exports one DesignModule; only src/app.ts imports them all and registers them.
import type { MessageKey } from '../core/i18n';
import { t } from '../core/i18n';
import type { Command } from '../core/commands';
import type { Camera, Design, DesignType } from '../io/schema-types';
import type { Schema } from '../io/schema';
import type { ItemRef } from '../model/types';
import type { BlockDiagram, Block } from '../model/types';
import type { FieldSpec } from '../inspector/fields';
import type { VNode } from '../render/vnode';
import type { SvgExportOptions } from '../export/svg';

/** What design commands can use (the shell provides it; designs never import the shell). */
export interface DesignCommandContext {
  readonly store: import('../core/store').Store;
  readonly gestures: import('../interaction/gestures').Gestures;
  /** The active block diagram. */
  data(): BlockDiagram;
  /** Commit an edit as one undo step (refusals are shown by the shell). */
  edit(fn: (d: BlockDiagram) => BlockDiagram): { ok: boolean };
  /** Centre of the visible canvas in diagram coordinates. */
  viewCentre(): { x: number; y: number };
  /** Fit the view to the design. */
  fitView(): void;
  /** Show a status message. */
  notify(key: MessageKey, vars?: Record<string, string | number>): void;
}

export interface DesignTemplate { id: string; label: MessageKey }

export interface NewDesign<D> { name: string; data: D; camera?: Camera }

export interface DesignModule<D = Design['data']> {
  type: DesignType;
  label: MessageKey;
  /** Validation of this type's data (io/schema DATA_SCHEMAS entry). */
  schema: Schema;
  templates: readonly DesignTemplate[];
  /** A blank design (no template) or a copy of a template, texts in the current language. */
  create(opts?: { template?: string }): NewDesign<D>;
  /** 'canvas' = the shared canvas / inspector; 'embedded' = a vendor editor in an iframe (3.30–3.31). */
  editor: 'canvas' | 'embedded';

  // ---- canvas designs that draw themselves (schedule, 3.28)
  /** Drawing and extent of a canvas design that is not a block diagram. */
  canvas?: CanvasDrawing<D>;

  // ---- canvas designs that are block diagrams ('function'; function / power view in BlockDiagram.view)
  /** True when the design uses the shared block-diagram canvas and router. Defaults for new
   *  blocks / wires follow the diagram's `view` (3.26c), not the design type. */
  blockDiagram?: true;
  /** Extra drawing on a block (part symbols, connector pins …), used by render/blocks `decorate`. */
  decorate?(b: Block, d: BlockDiagram): VNode | null;
  /** A strip along the bottom of a block (the power view's metric table, 3.27b). */
  blockFooter?(b: Block, d: BlockDiagram, measure: import('../render/texts').Measure): { height: number; node: VNode } | null;
  /** Drawing below / above the shared layers (frames, badges …), on the canvas and in exports. */
  renderExtras?(d: BlockDiagram): { below?: VNode[]; above?: VNode[] };
  /** Design-specific inspector fields, appended after the shared ones — complete, synchronous. */
  inspectorFields?(sel: ItemRef, d: BlockDiagram): FieldSpec<BlockDiagram, ItemRef>[];
  /** Design-specific commands, registered by the shell (context: the shell). */
  commands?: readonly Command<DesignCommandContext>[];
  /** Adjust a finished drag before it is committed (moved item ids). */
  afterMove?(d: BlockDiagram, movedIds: readonly string[]): BlockDiagram;
  /** Export additions (and the bounds they need). */
  exportExtras?: SvgExportOptions['extras'];
}

/** A canvas design's own drawing (the shell pans / zooms it and fits its bounds). */
export interface CanvasDrawing<D> {
  /** The drawing in diagram coordinates; `error` set when the data cannot be laid out. */
  render(data: D, opts: { selected: ReadonlySet<string>; measure: import('../render/texts').Measure }): { node: VNode | null; error?: MessageKey };
  /** Extent of the drawing (fit view), or null when empty. */
  bounds(data: D): { x: number; y: number; w: number; h: number } | null;
}

export class DesignRegistry {
  private modules = new Map<DesignType, DesignModule>();

  register(m: DesignModule): void {
    if (this.modules.has(m.type)) throw new Error(`design ${m.type} registered twice`);
    this.modules.set(m.type, m);
  }
  get(type: DesignType): DesignModule | undefined { return this.modules.get(type); }
  require(type: DesignType): DesignModule {
    const m = this.modules.get(type);
    if (!m) throw new Error(`no design module for ${type}`);
    return m;
  }
  list(): DesignModule[] { return [...this.modules.values()]; }
}

const I18N = '@i18n:';

/** Deep copy of template JSON with every "@i18n:key" string replaced by its current text. */
export function localize<T>(value: T): T {
  if (typeof value === 'string') return (value.startsWith(I18N) ? t(value.slice(I18N.length) as MessageKey) : value) as T;
  if (Array.isArray(value)) return value.map(localize) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v)])) as T;
  return value;
}

/** i18n keys a template refers to (for tests: every key must exist in both languages). */
export function templateKeys(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && value.startsWith(I18N)) out.push(value.slice(I18N.length));
  else if (Array.isArray(value)) value.forEach(v => templateKeys(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => templateKeys(v, out));
  return out;
}
