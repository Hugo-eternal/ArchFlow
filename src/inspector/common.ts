// Inspector fields shared by every block diagram (function and power): block, port, wire and
// text box. Design-specific fields (power metrics, parts, connectors, schedule tasks …) come
// from DesignModule.inspectorFields from step 3.24 and are appended after these.
//
// V2 sources (legacy/app.zh-Hant.html): base inspector L314 (ref, part number, title, wire name
// / kind / arrow / arrow size 4–24), appearance fields L519 / L3125, port table L3047, line
// format panel L1463, text controls L2219–L2303.
import type { Block, BlockDiagram, BlockStyle, LineFormat, Port, TextBox, TitleAlign, Wire } from '../model/types';
import { LIMITS, type ItemRef } from '../model/types';
import { blockOf, fitFrame, portOf, updateBlock, updateFrame, updatePort, updateText, updateWire, wireOf, FRAME } from '../model/diagram';
import { FILE_LIMITS } from '../io/schema';
import { commitEdit } from '../interaction/commit';
import type { Store } from '../core/store';
import { t, type MessageKey } from '../core/i18n';
import type { FieldOption, FieldSpec } from './fields';
import { InspectorPanel, type PanelOptions } from './panel';

export type BlockField = FieldSpec<BlockDiagram, ItemRef>;

const NAME_MAX = FILE_LIMITS.short;

const block = (d: BlockDiagram, s: ItemRef): Block => {
  const b = blockOf(d, s.id);
  if (!b) throw new Error(`no block ${s.id}`);
  return b;
};
const port = (d: BlockDiagram, s: ItemRef): Port => {
  if (s.kind !== 'port') throw new Error('not a port');
  const p = portOf(d, s.block, s.id);
  if (!p) throw new Error(`no port ${s.id}`);
  return p;
};
const wire = (d: BlockDiagram, s: ItemRef): Wire => {
  const w = wireOf(d, s.id);
  if (!w) throw new Error(`no wire ${s.id}`);
  return w;
};
const text = (d: BlockDiagram, s: ItemRef): TextBox => {
  const x = d.texts.find(t => t.id === s.id);
  if (!x) throw new Error(`no text ${s.id}`);
  return x;
};

const setBlock = <K extends keyof Block>(k: K) => (d: BlockDiagram, s: ItemRef, v: Block[K]) => updateBlock(d, s.id, { [k]: v } as Partial<Block>);
const setStyle = (k: keyof BlockStyle) => (d: BlockDiagram, s: ItemRef, v: string | number) => {
  const style: BlockStyle = { ...block(d, s).style };
  if (v === '') delete style[k]; else (style as Record<string, unknown>)[k] = v;
  return updateBlock(d, s.id, { style });
};
const setPort = <K extends keyof Port>(k: K) => (d: BlockDiagram, s: ItemRef, v: Port[K]) =>
  s.kind === 'port' ? updatePort(d, s.block, s.id, { [k]: v } as Partial<Port>) : d;
const setWire = <K extends keyof Wire>(k: K) => (d: BlockDiagram, s: ItemRef, v: Wire[K]) => updateWire(d, s.id, { [k]: v } as Partial<Wire>);
const setLine = <K extends keyof LineFormat>(k: K) => (d: BlockDiagram, s: ItemRef, v: LineFormat[K]) =>
  updateWire(d, s.id, { line: { ...wire(d, s).line, [k]: v } });
const setText = <K extends keyof TextBox>(k: K) => (d: BlockDiagram, s: ItemRef, v: TextBox[K]) => updateText(d, s.id, { [k]: v } as Partial<TextBox>);

const opts = <V extends string>(prefix: string, values: readonly V[]) =>
  values.map((value): FieldOption<V> => ({ value, label: `${prefix}.${value}` as MessageKey }));

export const TITLE_ALIGNS: readonly TitleAlign[] = ['top-left', 'top-center', 'top-right', 'center-left', 'center-center', 'center-right'];
export const PORT_TYPES = ['in', 'out', 'io', 'power', 'gnd'] as const;
export const PORT_LABELS = ['inside', 'outside', 'hidden'] as const;
export const WIRE_KINDS = ['signal', 'power', 'clock', 'bus'] as const;
export const WIRE_DASHES = ['solid', 'dash', 'dot'] as const;
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

/** Fallback colours the colour pickers show for "theme default" (V2 defaults). */
const FALLBACK = { fill: '#ffffff', border: '#243e5d', text: '#243e5d', wire: '#243e5d', background: '#ffffff' };

export function blockFields(): BlockField[] {
  return [
    { kind: 'text', key: 'title', label: 'inspector.block.title', maxLength: LIMITS.text, get: (d, s) => block(d, s).title, set: setBlock('title') },
    { kind: 'text', key: 'partNumber', label: 'inspector.block.partNumber', maxLength: NAME_MAX, get: (d, s) => block(d, s).partNumber, set: setBlock('partNumber') },
    { kind: 'text', key: 'ref', label: 'inspector.block.ref', maxLength: NAME_MAX, get: (d, s) => block(d, s).ref, set: setBlock('ref') },
    { kind: 'textarea', key: 'subtitle', label: 'inspector.block.subtitle', maxLength: LIMITS.text, rows: 2, get: (d, s) => block(d, s).subtitle, set: setBlock('subtitle') },
    {
      kind: 'select', key: 'titleAlign', label: 'inspector.block.titleAlign', options: opts('inspector.align', TITLE_ALIGNS),
      get: (d, s) => block(d, s).titleAlign ?? 'center-center',
      set: (d, s, v) => updateBlock(d, s.id, { titleAlign: v as TitleAlign }),
    },
    {
      kind: 'group', key: 'style', label: 'inspector.group.style', fields: [
        { kind: 'color', key: 'fill', label: 'inspector.style.fill', emptyLabel: 'inspector.color.default', fallback: FALLBACK.fill, get: (d, s) => block(d, s).style.fill ?? '', set: setStyle('fill') },
        { kind: 'color', key: 'border', label: 'inspector.style.border', emptyLabel: 'inspector.color.default', fallback: FALLBACK.border, get: (d, s) => block(d, s).style.border ?? '', set: setStyle('border') },
        { kind: 'color', key: 'textColor', label: 'inspector.style.text', emptyLabel: 'inspector.color.default', fallback: FALLBACK.text, get: (d, s) => block(d, s).style.text ?? '', set: setStyle('text') },
      ],
    },
    { kind: 'toggle', key: 'locked', label: 'inspector.locked', get: (d, s) => block(d, s).locked, set: setBlock('locked') },
  ];
}

export function portFields(): BlockField[] {
  return [
    { kind: 'text', key: 'name', label: 'inspector.port.name', maxLength: NAME_MAX, get: (d, s) => port(d, s).name, set: setPort('name') },
    {
      kind: 'select', key: 'type', label: 'inspector.port.type', options: opts('inspector.portType', PORT_TYPES),
      get: (d, s) => port(d, s).type, set: setPort('type'),
    },
    {
      kind: 'segmented', key: 'label', label: 'inspector.port.label', options: opts('inspector.portLabel', PORT_LABELS),
      get: (d, s) => port(d, s).label, set: (d, s, v) => setPort('label')(d, s, v as Port['label']),
    },
    { kind: 'toggle', key: 'locked', label: 'inspector.locked', get: (d, s) => port(d, s).locked, set: setPort('locked') },
  ];
}

export function wireFields(): BlockField[] {
  return [
    { kind: 'text', key: 'name', label: 'inspector.wire.name', maxLength: NAME_MAX, get: (d, s) => wire(d, s).name, set: setWire('name') },
    {
      kind: 'select', key: 'kind', label: 'inspector.wire.kind', options: opts('inspector.wireKind', WIRE_KINDS),
      get: (d, s) => wire(d, s).kind, set: setWire('kind'),
    },
    {
      kind: 'group', key: 'line', label: 'inspector.group.line', fields: [
        { kind: 'color', key: 'color', label: 'inspector.line.color', emptyLabel: 'inspector.color.default', fallback: FALLBACK.wire, get: (d, s) => wire(d, s).line.color, set: setLine('color') },
        { kind: 'number', key: 'width', label: 'inspector.line.width', unit: 'px', min: 0.5, max: 12, step: 0.1, get: (d, s) => wire(d, s).line.width, set: setLine('width') },
        {
          kind: 'segmented', key: 'dash', label: 'inspector.line.dash', options: opts('inspector.dash', WIRE_DASHES),
          get: (d, s) => wire(d, s).line.dash, set: setLine('dash'),
        },
        { kind: 'toggle', key: 'arrow', label: 'inspector.line.arrow', get: (d, s) => wire(d, s).line.arrow, set: setLine('arrow') },
        {
          kind: 'toggle', key: 'bothEnds', label: 'inspector.line.bothEnds', visible: (d, s) => wire(d, s).line.arrow,
          get: (d, s) => !!wire(d, s).line.bothEnds, set: (d, s, v) => setLine('bothEnds')(d, s, v || undefined),
        },
        {
          kind: 'number', key: 'arrowSize', label: 'inspector.line.arrowSize', unit: 'px', min: 4, max: 24, step: 1,
          visible: (d, s) => wire(d, s).line.arrow,
          get: (d, s) => wire(d, s).line.arrowSize ?? 9, set: setLine('arrowSize'),
        },
      ],
    },
    { kind: 'toggle', key: 'locked', label: 'inspector.locked', get: (d, s) => wire(d, s).locked, set: setWire('locked') },
  ];
}

export function textFields(): BlockField[] {
  return [
    { kind: 'textarea', key: 'text', label: 'inspector.text.content', maxLength: LIMITS.text, rows: 4, get: (d, s) => text(d, s).text, set: setText('text') },
    { kind: 'number', key: 'size', label: 'inspector.text.size', unit: 'pt', min: 6, max: 96, step: 1, get: (d, s) => text(d, s).size, set: setText('size') },
    { kind: 'color', key: 'color', label: 'inspector.text.color', fallback: FALLBACK.text, get: (d, s) => text(d, s).color, set: setText('color') },
    { kind: 'toggle', key: 'bold', label: 'inspector.text.bold', get: (d, s) => text(d, s).bold, set: setText('bold') },
    { kind: 'toggle', key: 'italic', label: 'inspector.text.italic', get: (d, s) => text(d, s).italic, set: setText('italic') },
    {
      kind: 'segmented', key: 'align', label: 'inspector.text.align', options: opts('inspector.textAlign', TEXT_ALIGNS),
      get: (d, s) => text(d, s).align, set: (d, s, v) => setText('align')(d, s, v as TextBox['align']),
    },
    {
      kind: 'color', key: 'background', label: 'inspector.text.background', empty: 'transparent', emptyLabel: 'inspector.color.transparent',
      fallback: FALLBACK.background, get: (d, s) => text(d, s).background, set: setText('background'),
    },
  ];
}

const frame = (d: BlockDiagram, s: ItemRef) => {
  const f = d.frames.find(x => x.id === s.id);
  if (!f) throw new Error(`no frame ${s.id}`);
  return f;
};

/** Area frame (V2 frame bar L4316): name, style, colour, size, fit contents. Delete = Delete key. */
export function frameFields(): BlockField[] {
  return [
    { kind: 'text', key: 'title', label: 'frame.name', maxLength: 80, get: (d, s) => frame(d, s).title, set: (d, s, v) => updateFrame(d, s.id, { title: v }) },
    {
      kind: 'segmented', key: 'style', label: 'frame.style', options: opts('frame.style', FRAME.styles),
      get: (d, s) => frame(d, s).style, set: (d, s, v) => updateFrame(d, s.id, { style: v }),
    },
    {
      kind: 'segmented', key: 'color', label: 'frame.color', options: opts('frame.color', FRAME.colors),
      get: (d, s) => frame(d, s).color, set: (d, s, v) => updateFrame(d, s.id, { color: v }),
    },
    { kind: 'number', key: 'w', label: 'frame.width', unit: 'px', min: FRAME.minW, max: 20000, step: 10, get: (d, s) => frame(d, s).w, set: (d, s, v) => updateFrame(d, s.id, { w: v }) },
    { kind: 'number', key: 'h', label: 'frame.height', unit: 'px', min: FRAME.minH, max: 20000, step: 10, get: (d, s) => frame(d, s).h, set: (d, s, v) => updateFrame(d, s.id, { h: v }) },
    {
      kind: 'custom', key: 'fit', label: 'frame.fit',
      render: ({ doc, sel, data, apply }) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'af-field-reset';
        b.textContent = t('frame.fit');
        const fitted = fitFrame(data, sel.id, data.grid.snap ? data.grid.size : 10);
        b.disabled = !fitted;
        b.title = fitted ? '' : t('frame.fitEmpty');
        b.addEventListener('click', () => apply(d => fitFrame(d, sel.id, d.grid.snap ? d.grid.size : 10) ?? d));
        return b;
      },
    },
  ];
}

/** The shared fields for a selection, or null when the item has no shared fields. */
export function commonFields(sel: ItemRef): BlockField[] | null {
  switch (sel.kind) {
    case 'block': return blockFields();
    case 'port': return portFields();
    case 'wire': return wireFields();
    case 'text': return textFields();
    case 'frame': return frameFields();
    default: return null;
  }
}

/** Whether `sel` still exists in `d` (a selection can outlive its item after undo). */
export function exists(d: BlockDiagram, sel: ItemRef): boolean {
  switch (sel.kind) {
    case 'block': return !!blockOf(d, sel.id);
    case 'port': return !!portOf(d, sel.block, sel.id);
    case 'wire': return !!wireOf(d, sel.id);
    case 'text': return d.texts.some(x => x.id === sel.id);
    case 'junction': return d.junctions.some(x => x.id === sel.id);
    case 'frame': return d.frames.some(x => x.id === sel.id);
  }
}

export interface BlockInspector {
  panel: InspectorPanel<BlockDiagram, ItemRef>;
  /** Show the fields for a selection (null = none); `extra` = design-specific fields. */
  show(sel: ItemRef | null, extra?: readonly BlockField[]): void;
  destroy(): void;
}

/**
 * A panel bound to the active block diagram of `store`: changes go through commitEdit (one
 * undo step each), and the panel follows undo / redo and canvas edits through the store.
 */
export function blockInspector(root: HTMLElement, store: Store, options: Partial<PanelOptions<BlockDiagram, ItemRef>> = {}): BlockInspector {
  const data = () => store.data(store.activeDesignId) as BlockDiagram;
  const panel = new InspectorPanel<BlockDiagram, ItemRef>(root, {
    data,
    commit: edit => commitEdit(store, edit),
    ...options,
  });
  let current: { sel: ItemRef | null; extra: readonly BlockField[] } = { sel: null, extra: [] };
  const show = (sel: ItemRef | null, extra: readonly BlockField[] = []) => {
    current = { sel, extra };
    const fields = sel ? commonFields(sel) : null;
    if (!sel || !fields || !exists(data(), sel)) panel.show([], null);
    else panel.show([...fields, ...extra], sel);
  };
  const off = store.subscribe(() => {
    const sel = current.sel;
    if (sel && !exists(data(), sel)) show(null);
    else panel.sync();
  });
  return { panel, show, destroy: () => { off(); panel.destroy(); } };
}
