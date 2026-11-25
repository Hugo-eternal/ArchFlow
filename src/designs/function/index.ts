// designs/function — function block diagrams. Blocks, ports, wires and text use the shared
// block-diagram canvas (render / router / interaction / inspector); this module adds what is
// specific to function designs: the template catalogue and, from 3.25–3.26, the parts library
// and symbols, voltage badges, area frames, connectors and the LCD template.
//
// V2: workspaceExample / loadWorkspaceExample (L602–L1538, L3145, L3369, L3544, L10434) — the
// starter template ("Starter block diagram"), extracted from V2.10.1 with
// tests/tools/v2-to-v3.ts; texts are i18n keys (template.function.starter.*).
import type { BlockDiagram } from '../../model/types';
import { emptyDiagram } from '../../model/diagram';
import { DATA_SCHEMAS } from '../../io/schema';
import { localize, type DesignModule } from '../module';
import starter from './templates/starter.json';

const TEMPLATES = { starter } as const;

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
};
