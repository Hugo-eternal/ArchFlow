// Inspector fields shared by every block diagram (function and power): block, port, wire and
// text box. Design-specific fields (power metrics, parts, connectors, schedule tasks …) come
// from DesignModule.inspectorFields from step 3.24 and are appended after these.
//
// V2 sources (legacy/app.zh-Hant.html): base inspector L314 (ref, part number, title, wire name
// / kind / arrow / arrow size 4–24), appearance fields L519 / L3125, port table L3047, line
// format panel L1463, text controls L2219–L2303.
import type { Block, BlockDiagram, BlockStyle, BlockView, LineFormat, Port, TextBox, TitleAlign, Wire } from '../model/types';
import { LIMITS, type ItemRef } from '../model/types';
import { addPort, applyFontsToAll, blockOf, BLOCK_SIZE, fitFrame, remove, resizeBlock, portOf, setPortSide, updateBlock, updateFrame, updatePort, updateText, updateWire, wireOf, FRAME } from '../model/diagram';
import { FILE_LIMITS } from '../io/schema';
import { commitEdit } from '../interaction/commit';
import { scaleTextOn, setScaleText } from '../core/prefs';
import { setLabelMark } from '../model/route-edit';
import { routeAll } from '../router/full-path';
import { labelBox, labelPosition, wireLabel } from '../render/wires';
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

/**
 * A field shown only in one view of the block diagram (plan §2.2.1: power fields appear in the
 * power view only; the data stays in both). Combines with the field's own `visible`.
 */
export function inView<F extends BlockField>(view: BlockView, field: F): F {
  const own = field.visible;
  return { ...field, visible: (d: BlockDiagram, s: ItemRef) => d.view === view && (!own || own(d, s)) };
}

export function blockFields(): BlockField[] {
  const ordinary = (d: BlockDiagram, sel: ItemRef) => { const b = block(d, sel); return !b.part && !b.connector; };
  return [
    // V2.10.1 groups: "basic" (name / part number first), then "inputs / outputs", then the rest
    {
      kind: 'group', key: 'basic', label: 'inspector.group.basic', fields: [
        { kind: 'text', key: 'partNumber', label: 'inspector.block.partNumber', maxLength: NAME_MAX, get: (d, s) => block(d, s).partNumber, set: setBlock('partNumber') },
        { kind: 'text', key: 'title', label: 'inspector.block.title', maxLength: LIMITS.text, get: (d, s) => block(d, s).title, set: setBlock('title') },
        { kind: 'text', key: 'ref', label: 'inspector.block.ref', maxLength: NAME_MAX, get: (d, s) => block(d, s).ref, set: setBlock('ref') },
        { kind: 'textarea', key: 'subtitle', label: 'inspector.block.subtitle', maxLength: LIMITS.text, rows: 2, get: (d, s) => block(d, s).subtitle, set: setBlock('subtitle') },
        {
          kind: 'select', key: 'titleAlign', label: 'inspector.block.titleAlign', options: opts('inspector.align', TITLE_ALIGNS),
          get: (d, s) => block(d, s).titleAlign ?? 'center-center',
          set: (d, s, v) => updateBlock(d, s.id, { titleAlign: v as TitleAlign }),
        },
      ],
    },
    { kind: 'group', key: 'ports', label: 'inspector.group.ports', visible: ordinary, fields: [portsField()] },
    {
      kind: 'group', key: 'style', label: 'inspector.group.style', fields: [
        { kind: 'color', key: 'fill', label: 'inspector.style.fill', emptyLabel: 'inspector.color.default', fallback: FALLBACK.fill, get: (d, s) => block(d, s).style.fill ?? '', set: setStyle('fill') },
        { kind: 'color', key: 'border', label: 'inspector.style.border', emptyLabel: 'inspector.color.default', fallback: FALLBACK.border, get: (d, s) => block(d, s).style.border ?? '', set: setStyle('border') },
        { kind: 'color', key: 'textColor', label: 'inspector.style.text', emptyLabel: 'inspector.color.default', fallback: FALLBACK.text, get: (d, s) => block(d, s).style.text ?? '', set: setStyle('text') },
      ],
    },
    sizeGroup(),
    { kind: 'toggle', key: 'locked', label: 'inspector.locked', get: (d, s) => block(d, s).locked, set: setBlock('locked') },
  ];
}

const PORT_SIDES = ['l', 'r', 't', 'b'] as const;
const TYPE_BADGE: Record<string, string> = { in: 'IN', out: 'OUT', io: 'I/O', power: 'PWR', gnd: 'GND' };

/**
 * The block's pins as V2's port table (L3047 / V1.5 af15-ports): a row per pin — type badge
 * (click: next type), name, side, delete — and its name position; counts, add input / output /
 * bidirectional, and one name position for all pins.
 */
function portsField(): BlockField {
  return {
    kind: 'custom', key: 'portList', label: 'inspector.group.ports',
    render: ({ doc, data, sel, apply, id }) => {
      const b = block(data, sel);
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
        const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e;
      };
      // a button keeps the focus inside the list, which stops the panel from redrawing it: let go first
      const act = (btn: HTMLButtonElement, edit: (d: BlockDiagram) => BlockDiagram) => btn.addEventListener('click', () => { btn.blur(); apply(edit); });
      const segmented = (name: string, label: string, value: string | null, set: (v: Port['label']) => void) => {
        const g = el('div', 'af-port-seg'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
        for (const m of PORT_LABELS) {
          const r = el('button', '', t(`inspector.portLabel.${m}` as MessageKey)) as HTMLButtonElement;
          r.type = 'button'; r.setAttribute('role', 'radio'); r.setAttribute('aria-checked', String(value === m)); r.name = name;
          r.addEventListener('click', () => { r.blur(); set(m); });
          g.append(r);
        }
        return g;
      };
      const wrap = el('div', 'af-ports');
      const count = (types: string[]) => b.ports.filter(p => types.includes(p.type)).length;
      wrap.append(el('p', 'af-ports-count', t('inspector.ports.count', { in: count(['in']), out: count(['out']), io: count(['io']), power: count(['power', 'gnd']) })));
      const list = el('div', 'af-ports-list');
      b.ports.forEach((p, i) => {
        const row = el('div', 'af-port-row');
        const badge = el('button', `af-port-badge is-${p.type}`, TYPE_BADGE[p.type] ?? p.type.toUpperCase()) as HTMLButtonElement;
        badge.type = 'button';
        badge.setAttribute('aria-label', t('inspector.ports.type', { name: p.name, type: t(`inspector.portType.${p.type}` as MessageKey) }));
        const next = PORT_TYPES[(PORT_TYPES.indexOf(p.type as typeof PORT_TYPES[number]) + 1) % PORT_TYPES.length];
        act(badge, d => updatePort(d, b.id, p.id, { type: next }));
        const name = el('input', 'af-port-name') as HTMLInputElement;
        name.value = p.name; name.maxLength = NAME_MAX; name.id = `${id}-${i}`;
        name.setAttribute('aria-describedby', `${id}-hint`);
        const nameLabel = el('label', 'af-visually-hidden', t('inspector.ports.name', { n: i + 1 })) as HTMLLabelElement;
        nameLabel.htmlFor = name.id;
        name.addEventListener('change', () => { if (name.value !== p.name) apply(d => updatePort(d, b.id, p.id, { name: name.value })); });
        name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });
        const side = el('select', 'af-port-side') as HTMLSelectElement;
        side.id = `${id}-${i}-side`;
        side.setAttribute('aria-describedby', `${id}-hint`);
        const sideLabel = el('label', 'af-visually-hidden', t('inspector.ports.side', { name: p.name })) as HTMLLabelElement;
        sideLabel.htmlFor = side.id;
        for (const sd of PORT_SIDES) { const o = el('option', '', t(`inspector.side.${sd}` as MessageKey)) as HTMLOptionElement; o.value = sd; o.selected = p.side === sd; side.append(o); }
        side.addEventListener('change', () => apply(d => setPortSide(d, b.id, p.id, side.value as Port['side'])));
        const del = el('button', 'af-port-del', '\u00d7') as HTMLButtonElement;
        del.type = 'button'; del.setAttribute('aria-label', t('inspector.ports.delete', { name: p.name }));
        act(del, d => remove(d, [{ kind: 'port', block: b.id, id: p.id }]));
        const labelRow = el('div', 'af-port-pos');
        labelRow.append(el('span', 'af-port-pos-title', t('inspector.ports.nameShort')),
          segmented(`${id}-l${i}`, t('inspector.ports.labelOf', { name: p.name }), p.label, v => apply(d => updatePort(d, b.id, p.id, { label: v }))));
        row.append(nameLabel, sideLabel, badge, name, side, del, labelRow);
        list.append(row);
      });
      wrap.append(list);
      const adds = el('div', 'af-ports-add');
      for (const [type, key] of [['in', 'inspector.ports.addIn'], ['out', 'inspector.ports.addOut'], ['io', 'inspector.ports.addIo']] as const) {
        const btn = el('button', 'af-field-action', t(key)) as HTMLButtonElement;
        btn.type = 'button';
        act(btn, d => addPort(d, b.id, type).data);
        adds.append(btn);
      }
      wrap.append(adds);
      const hint = el('p', 'af-field-hint', t('inspector.ports.hint'));
      hint.id = `${id}-hint`;
      wrap.append(hint);
      if (b.ports.length) {
        const modes = new Set(b.ports.map(p => p.label));
        const all = el('div', 'af-port-pos is-all');
        all.append(el('span', 'af-port-pos-title', t('inspector.ports.all')),
          segmented(`${id}-all`, t('inspector.ports.allLabel'), modes.size === 1 ? [...modes][0] : null,
            v => apply(d => b.ports.reduce((x, p) => updatePort(x, b.id, p.id, { label: v }), d))));
        wrap.append(all);
      }
      return wrap;
    },
  };
}

/** px → pt, to half a point (V2 PT); pt → px. */
const toPt = (px: number) => Math.round(px * 1.5) / 2, toPx = (pt: number) => pt * 4 / 3;
const DEFAULT_FONT = { title: 80 / 3, subtitle: 14, label: 11, metric: 14 };

/**
 * Size and text of an ordinary block (V2 "Position and size", V2.7 per-block sizes, V2.9 free size
 * and no main name, V2.10 scale text with the block). Not for parts and connectors (V2: afSym).
 */
function sizeGroup(): BlockField {
  const ordinary = (d: BlockDiagram, s: ItemRef) => { const b = block(d, s); return !b.part && !b.connector; };
  const theme = (d: BlockDiagram) => ({ ...DEFAULT_FONT, ...d.theme });
  const fontField = (k: 'subtitle' | 'label' | 'metric', min: number, max: number): BlockField => ({
    kind: 'number', key: `font-${k}`, label: `inspector.font.${k}` as MessageKey, unit: 'pt', min, max, step: 0.5,
    get: (d, s) => toPt(block(d, s).font?.[k] ?? theme(d)[k]),
    set: (d, s, v) => updateBlock(d, s.id, { font: { ...block(d, s).font, [k]: Math.max(8, Math.min(32, toPx(v))) } }),
  });
  return {
    kind: 'group', key: 'size', label: 'inspector.group.size', visible: ordinary, fields: [
      { kind: 'toggle', key: 'showTitle', label: 'inspector.block.showTitle', get: (d, s) => block(d, s).showTitle, set: setBlock('showTitle') },
      { kind: 'toggle', key: 'free', label: 'inspector.block.free', hint: 'inspector.block.freeHint', get: (d, s) => block(d, s).sizing === 'free', set: (d, s, v) => updateBlock(d, s.id, { sizing: v ? 'free' : 'auto' }) },
      { kind: 'number', key: 'w', label: 'inspector.block.w', unit: 'px', min: BLOCK_SIZE.freeMin, max: BLOCK_SIZE.max, step: 1, get: (d, s) => block(d, s).w, set: (d, s, v) => resizeBlock(d, s.id, v, block(d, s).h, { scaleText: scaleTextOn(), theme: theme(d) }) },
      { kind: 'number', key: 'h', label: 'inspector.block.h', unit: 'px', min: BLOCK_SIZE.freeMin, max: BLOCK_SIZE.max, step: 1, get: (d, s) => block(d, s).h, set: (d, s, v) => resizeBlock(d, s.id, block(d, s).w, v, { scaleText: scaleTextOn(), theme: theme(d) }) },
      {
        kind: 'custom', key: 'scaleText', label: 'inspector.block.scaleText',
        render: ({ doc, id }) => {
          const label = doc.createElement('label');
          label.className = 'af-check';
          const box = doc.createElement('input');
          box.type = 'checkbox'; box.id = id; box.checked = scaleTextOn();
          box.addEventListener('change', () => setScaleText(box.checked));
          label.append(box, doc.createTextNode(` ${t('inspector.block.scaleText')}`));
          // a preference of this browser, not of the file
          const hint = doc.createElement('small');
          hint.id = `${id}-hint`; hint.className = 'af-field-hint'; hint.textContent = t('inspector.block.scaleTextHint');
          box.setAttribute('aria-describedby', hint.id);
          const wrap = doc.createElement('div');
          wrap.append(label, hint);
          return wrap;
        },
      },
      {
        kind: 'number', key: 'titleSize', label: 'inspector.font.title', unit: 'pt', min: 9, max: 36, step: 0.5,
        get: (d, s) => toPt(block(d, s).style.titleSize ?? theme(d).title),
        set: (d, s, v) => setStyle('titleSize')(d, s, Math.max(12, Math.min(48, toPx(v)))),
      },
      fontField('subtitle', 7, 24), fontField('label', 6, 21), fontField('metric', 7, 24),
      {
        kind: 'custom', key: 'fontsToAll', label: 'inspector.font.toAll',
        render: ({ doc, apply, sel }) => {
          const b = doc.createElement('button');
          b.type = 'button'; b.className = 'af-field-action'; b.textContent = t('inspector.font.toAll');
          b.addEventListener('click', () => apply(dd => applyFontsToAll(dd, sel.id)));
          return b;
        },
      },
    ],
  };
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
    markGroup(),
    { kind: 'toggle', key: 'locked', label: 'inspector.locked', get: (d, s) => wire(d, s).locked, set: setWire('locked') },
  ];
}

/** Routes of a diagram, computed once per data value (the label's automatic place needs them). */
const routeCache = new WeakMap<BlockDiagram, ReturnType<typeof routeAll>>();
const routesOf = (d: BlockDiagram) => { let r = routeCache.get(d); if (!r) { r = routeAll(d); routeCache.set(d, r); } return r; };

/** Where the wire's label is now: its mark, else the automatic place (V2 v4LabelPosition). */
function markOf(d: BlockDiagram, s: ItemRef): { x: number; y: number; angle: number } | null {
  const w = wire(d, s);
  if (w.label?.mark) return { ...w.label.mark };
  const r = routesOf(d).get(w.id), text = wireLabel(w, d.view), pos = r && text ? labelPosition(w, r.ps) : null;
  if (!pos) return null;
  return { x: pos.anchor === 'middle' ? pos.x : pos.x + labelBox(w, pos, text).w / 2, y: pos.y, angle: 0 };
}

/**
 * The wire label's position and angle (V2 v4 "Wire name / value mark", L1805): X / Y / angle,
 * Horizontal / Vertical / Vertical reverse / Reverse, ±15°, back to the automatic place. Dragging
 * the label on the canvas does the same.
 */
function markGroup(): BlockField {
  const has = (d: BlockDiagram, s: ItemRef) => markOf(d, s) !== null;
  const set = (k: 'x' | 'y' | 'angle') => (d: BlockDiagram, s: ItemRef, v: number) => { const m = markOf(d, s); return m ? setLabelMark(d, s.id, { ...m, [k]: v }) : d; };
  return {
    kind: 'group', key: 'mark', label: 'inspector.group.mark', visible: has, fields: [
      {
        kind: 'custom', key: 'markState', label: 'inspector.mark.state',
        render: ({ doc, data, sel }) => { const p = doc.createElement('p'); p.className = 'af-field-hint'; p.textContent = t(wire(data, sel).label?.mark ? 'inspector.mark.manual' : 'inspector.mark.auto'); return p; },
      },
      { kind: 'number', key: 'markX', label: 'inspector.mark.x', unit: 'px', min: -1e7, max: 1e7, step: 1, get: (d, s) => Math.round((markOf(d, s)?.x ?? 0) * 100) / 100, set: set('x') },
      { kind: 'number', key: 'markY', label: 'inspector.mark.y', unit: 'px', min: -1e7, max: 1e7, step: 1, get: (d, s) => Math.round((markOf(d, s)?.y ?? 0) * 100) / 100, set: set('y') },
      { kind: 'number', key: 'markAngle', label: 'inspector.mark.angle', unit: '\u00b0', min: -360, max: 360, step: 15, get: (d, s) => markOf(d, s)?.angle ?? 0, set: set('angle') },
      {
        kind: 'custom', key: 'markActions', label: 'inspector.group.mark',
        render: ({ doc, apply, sel }) => {
          const row = doc.createElement('div');
          row.className = 'af-field-actions';
          const add = (text: string, edit: (d: BlockDiagram) => BlockDiagram) => {
            const b = doc.createElement('button');
            b.type = 'button'; b.className = 'af-field-reset'; b.textContent = text;
            b.addEventListener('click', () => apply(edit));
            row.append(b);
          };
          const at = (angle: (cur: number) => number) => (d: BlockDiagram) => { const m = markOf(d, sel); return m ? setLabelMark(d, sel.id, { ...m, angle: angle(m.angle) }) : d; };
          add(t('inspector.mark.horizontal'), at(() => 0));
          add(t('inspector.mark.vertical'), at(() => 90));
          add(t('inspector.mark.verticalReverse'), at(() => 270));
          add(t('inspector.mark.reverse'), at(() => 180));
          add('\u221215\u00b0', at(a => a - 15));
          add('+15\u00b0', at(a => a + 15));
          add(t('inspector.mark.reset'), d => setLabelMark(d, sel.id, null));
          return row;
        },
      },
    ],
  };
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
  // the store can switch to a design that is not a block diagram before the shell unmounts this
  // panel (adding / switching designs with a block selected): then nothing here is shown
  const isDiagram = (d: unknown): d is BlockDiagram => !!d && Array.isArray((d as BlockDiagram).blocks);
  const present = (sel: ItemRef) => { const d = data(); return isDiagram(d) && exists(d, sel); };
  const panel = new InspectorPanel<BlockDiagram, ItemRef>(root, {
    data,
    commit: edit => commitEdit(store, edit),
    ...options,
  });
  let current: { sel: ItemRef | null; extra: readonly BlockField[] } = { sel: null, extra: [] };
  const show = (sel: ItemRef | null, extra: readonly BlockField[] = []) => {
    current = { sel, extra };
    const fields = sel ? commonFields(sel) : null;
    if (!sel || !fields || !present(sel)) panel.show([], null);
    else panel.show([...fields, ...extra], sel);
  };
  const off = store.subscribe(() => {
    const sel = current.sel;
    if (sel && !present(sel)) show(null);
    else if (isDiagram(data())) panel.sync();
  });
  return { panel, show, destroy: () => { off(); panel.destroy(); } };
}
