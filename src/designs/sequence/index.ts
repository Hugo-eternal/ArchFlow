// designs/sequence — power-sequence designs, edited by the V2 vendor editor in an iframe
// (vendor/sequence-editor, React bundle without source; VENDOR.md has the host interface). The
// shell mounts the frame and the host object (shell/embedded.ts); this module only supplies the
// frame document, the templates, the clean-up of documents coming back, and the blank document.
//
// V2: shell L5563 — afSeqHost, o4 (srcdoc), Tf (new designs from the template catalogue `bd`,
// four examples per language), jf (clean-up, here sanitize.ts).
import type { SequenceDoc } from '../../io/schema-types';
import { DATA_SCHEMAS } from '../../io/schema';
import type { MessageKey } from '../../core/i18n';
import { localize, type DesignModule } from '../module';
import { sanitizeSequence } from './sanitize';
import templates from './templates/templates.json';
import bundle from '../../../vendor/sequence-editor/bundle.js?raw';
import { FONT_CSS } from '../../styles/fonts';
import style from '../../../vendor/sequence-editor/style.css?raw';

type Template = { id: string; label: string; name: string; doc: SequenceDoc };
const TEMPLATES = templates as unknown as Template[];

/** The frame document, as V2 built it (o4): style, root, bundle; `lang` picks the editor language. */
export function sequenceSrcdoc(lang: 'zh-Hant' | 'en'): string {
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-Hant'}"><head><meta charset="utf-8"><style>${FONT_CSS}</style><style>${style}</style></head>`
    + `<body><div id="root"></div><script>${bundle}<\/script></body></html>`;
}

export const sequenceDesign: DesignModule<SequenceDoc> = {
  type: 'sequence',
  label: 'design.type.sequence',
  schema: DATA_SCHEMAS.sequence,
  templates: TEMPLATES.map(t => ({ id: t.id, label: t.label.replace('@i18n:', '') as MessageKey })),
  editor: 'embedded',
  create({ template } = {}) {
    if (!template) return { name: '', data: { name: '', rails: [] } };
    const tpl = TEMPLATES.find(t => t.id === template);
    if (!tpl) throw new Error(`unknown sequence template ${template}`);
    const out = localize(tpl);
    // as V2 (Ff): the template document itself; the editor fills its defaults on the first change
    return { name: out.name, data: out.doc };
  },
  embedded: {
    title: 'sequence.frame',
    srcdoc: sequenceSrcdoc,
    host: 'afSeqHost',
    api: 'afSeqApi',
    sanitize: sanitizeSequence,
  },
};
