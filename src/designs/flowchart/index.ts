// designs/flowchart — flowcharts, edited by the V2 vendor editor in an iframe
// (vendor/flowchart-editor, React bundle without source; VENDOR.md has the host interface). Like
// designs/sequence: frame document, template, clean-up of returned documents, blank document.
//
// V2: shell L5765 — afFlowHost (with `images`: pictures placed in a chart live in a Map on the
// parent window, `__afFlowImages`, and are not saved in the project file — as in V2), m4 (srcdoc),
// the "LCD panel power-on" example (Vf, auto-laid out by Bd; extracted from V2.10.1), Pf (clean-up).
import type { FlowchartDoc } from '../../io/schema-types';
import { DATA_SCHEMAS } from '../../io/schema';
import type { MessageKey } from '../../core/i18n';
import { localize, type DesignModule } from '../module';
import { emptyFlowchart, sanitizeFlowchart } from './sanitize';
import templates from './templates/templates.json';
import bundle from '../../../vendor/flowchart-editor/bundle.js?raw';
import { FONT_CSS } from '../../styles/fonts';
import style from '../../../vendor/flowchart-editor/style.css?raw';

type Template = { id: string; label: string; name: string; doc: FlowchartDoc };
const TEMPLATES = templates as unknown as Template[];

export function flowchartSrcdoc(lang: 'zh-Hant' | 'en'): string {
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-Hant'}"><head><meta charset="utf-8"><style>${FONT_CSS}</style><style>${style}</style></head>`
    + `<body><div id="root"></div><script>${bundle}<\/script></body></html>`;
}

/** The pictures of flowcharts, shared by every flowchart frame of this window (V2 jd). */
function imageStore(): Map<string, unknown> {
  const w = (typeof window !== 'undefined' ? window : {}) as { __afFlowImages?: Map<string, unknown> };
  return (w.__afFlowImages ??= new Map());
}

export const flowchartDesign: DesignModule<FlowchartDoc> = {
  type: 'flowchart',
  label: 'design.type.flowchart',
  schema: DATA_SCHEMAS.flowchart,
  templates: TEMPLATES.map(t => ({ id: t.id, label: t.label.replace('@i18n:', '') as MessageKey })),
  editor: 'embedded',
  create({ template } = {}) {
    if (!template) return { name: '', data: emptyFlowchart() };
    const tpl = TEMPLATES.find(t => t.id === template);
    if (!tpl) throw new Error(`unknown flowchart template ${template}`);
    const out = localize(tpl);
    // as V2: the example goes through the clean-up once (uu(qf()))
    return { name: out.name, data: sanitizeFlowchart(out.doc) };
  },
  embedded: {
    title: 'flowchart.frame',
    srcdoc: flowchartSrcdoc,
    host: 'afFlowHost',
    api: 'afFlowApi',
    sanitize: sanitizeFlowchart,
    hostExtras: () => ({ images: imageStore() }),
  },
};
