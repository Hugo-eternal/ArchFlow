// designs/function — function block diagrams. Blocks, ports, wires and text use the shared
// block-diagram canvas (render / router / interaction / inspector); this module adds what is
// specific to function designs: the template catalogue, the parts library (schematic symbols)
// and voltage badges (3.25), and from 3.26 area frames, connectors and the LCD template.
//
// V2: workspaceExample / loadWorkspaceExample (L602–L1538, L3145, L3369, L3544, L10434) — the
// starter template ("Starter block diagram"), extracted from V2.10.1 with
// tests/tools/v2-to-v3.ts; texts are i18n keys (template.function.starter.*).
// Parts and badges: parts.ts (V2 af15-ux2 L3870–L4140).
import type { Block, BlockDiagram, ItemRef } from '../../model/types';
import { addBlock, emptyDiagram, freeSpot, updateBlock } from '../../model/diagram';
import { gridSize } from '../../core/grid';
import { t, type MessageKey } from '../../core/i18n';
import type { Command } from '../../core/commands';
import { DATA_SCHEMAS } from '../../io/schema';
import { routeAll } from '../../router/full-path';
import { h } from '../../render/vnode';
import type { FieldSpec } from '../../inspector/fields';
import { localize, type DesignCommandContext, type DesignModule } from '../module';
import {
  PARTS, badgesNode, cleanRails, decorationBounds, isTwoPin, makePart, normRail, partItem, partNode,
  reshapePart, setPartValue, sizesFor, type PartKind,
} from './parts';
import starter from './templates/starter.json';

const TEMPLATES = { starter } as const;
type F = FieldSpec<BlockDiagram, ItemRef>;

const blockOf = (d: BlockDiagram, s: ItemRef): Block => {
  const b = d.blocks.find(x => x.id === s.id);
  if (!b) throw new Error(`no block ${s.id}`);
  return b;
};

/** Panel of a part (V2 railsSection for symbols L4076): value, size, direction. */
function partFields(b: Block): F[] {
  const k = b.part!.kind;
  const fields: F[] = [];
  if (k !== 'gnd') {
    fields.push({
      kind: 'text', key: 'partValue', label: k === 'vcc' ? 'part.field.voltage' : 'part.field.label', maxLength: 200,
      placeholder: k === 'vcc' ? 'part.field.voltageHint' : 'part.field.labelHint',
      get: (d, s) => blockOf(d, s).partNumber,
      set: (d, s, v) => setPartValue(d, s.id, k === 'vcc' ? normRail(v) || v.trim() : v.trim()),
    });
  }
  fields.push({
    kind: 'segmented', key: 'partSize', label: 'part.field.size',
    options: sizesFor(k).map(v => ({ value: v, label: `part.size.${v}` as MessageKey })),
    get: (d, s) => blockOf(d, s).part?.size ?? 'M',
    set: (d, s, v) => reshapePart(d, s.id, { size: v as 'S' | 'M' | 'L' }),
  });
  if (isTwoPin(k)) {
    fields.push({
      kind: 'segmented', key: 'partRot', label: 'part.field.direction',
      options: [{ value: '0', label: 'part.direction.horizontal' }, { value: '90', label: 'part.direction.vertical' }],
      get: (d, s) => String(blockOf(d, s).part?.rot ?? 0),
      set: (d, s, v) => reshapePart(d, s.id, { rot: v === '90' ? 90 : 0 }),
    });
  }
  return fields;
}

/** Voltage badges of a plain block, as "3.3V, 1.8V" (V2 rails section, up to four). */
const railsField: F = {
  kind: 'text', key: 'rails', label: 'part.field.rails', hint: 'part.field.railsHint', maxLength: 60,
  get: (d, s) => cleanRails(blockOf(d, s).rails).join(', '),
  set: (d, s, v) => {
    const rails = cleanRails(v.split(/[,\uFF0C\u3001;\s]+/));
    return updateBlock(d, s.id, { rails: rails.length ? rails : undefined });
  },
  validate: v => (v.split(/[,\uFF0C\u3001;\s]+/).map(normRail).filter(Boolean).length > 4 ? 'part.field.railsTooMany' : null),
};

function insertCommand(kind: PartKind): Command<DesignCommandContext> {
  return {
    id: `part.insert.${kind}`, label: `part.${kind}` as MessageKey, group: 'parts',
    enabled: c => !c.gestures.busy && !!c.store.activeDesign && c.store.activeDesign.type === 'function',
    run: c => {
      const d = c.data(), at = c.viewCentre();
      const p = makePart(kind, at, t(partItem(kind)!.label));
      // keep clear of blocks, their badges and existing wires (V2 attach() avoided crossings too)
      const obstacles = [
        ...d.blocks.flatMap(b => decorationBounds(b)),
        ...[...routeAll(d).values()].flatMap(r => r.ps.slice(1).map((q, i) => {
          const a = r.ps[i];
          return { x: Math.min(a.x, q.x), y: Math.min(a.y, q.y), w: Math.abs(a.x - q.x), h: Math.abs(a.y - q.y) };
        })),
      ];
      const spot = freeSpot(d, p.w, p.h, at, d.grid.snap ? gridSize(d.grid) : 1, 20, obstacles);
      p.x = spot.x; p.y = spot.y;
      let id = '';
      const r = c.edit(x => { const out = addBlock(x, p); id = out.id; return out.data; });
      if (r.ok) c.gestures.select([{ kind: 'block', id }]);
    },
  };
}

const rotateCommand: Command<DesignCommandContext> = {
  id: 'part.rotate', label: 'part.rotate', group: 'parts-edit', shortcut: 'R',
  enabled: c => {
    const s = c.gestures.selection;
    if (c.gestures.busy || s.length !== 1 || s[0].kind !== 'block' || c.store.activeDesign?.type !== 'function') return false;
    const b = c.data().blocks.find(x => x.id === s[0].id);
    return !!b?.part && isTwoPin(b.part.kind);
  },
  run: c => {
    const id = c.gestures.selection[0].id, b = c.data().blocks.find(x => x.id === id)!;
    c.edit(d => reshapePart(d, id, { rot: b.part!.rot === 90 ? 0 : 90 }));
  },
};

export const functionDesign: DesignModule<BlockDiagram> = {
  type: 'function',
  label: 'design.type.function',
  schema: DATA_SCHEMAS.function,
  templates: [{ id: 'starter', label: 'template.function.starter.name' }],
  editor: 'canvas',
  blockDiagram: { flavour: 'function' },
  create({ template } = {}) {
    if (!template) return { name: '', data: emptyDiagram() };
    const tpl = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!tpl) throw new Error(`unknown function template ${template}`);
    const out = localize(tpl) as unknown as { name: string; camera: { x: number; y: number; z: number }; data: BlockDiagram };
    return { name: out.name, data: out.data, camera: out.camera };
  },
  decorate(b) {
    const sym = partNode(b), badges = badgesNode(b);
    return sym || badges ? h('g', { class: 'af-decor' }, [sym, badges]) : null;
  },
  inspectorFields(sel, d) {
    if (sel.kind !== 'block') return [];
    const b = d.blocks.find(x => x.id === sel.id);
    if (!b) return [];
    return b.part ? partFields(b) : [railsField];
  },
  commands: [...PARTS.map(p => insertCommand(p.kind)), rotateCommand],
  exportExtras: ({ data, measure }) => ({ bounds: data.blocks.flatMap(b => decorationBounds(b, measure)) }),
};
