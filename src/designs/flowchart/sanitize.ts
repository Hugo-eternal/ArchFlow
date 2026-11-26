// designs/flowchart — clean a flowchart document coming back from the vendor editor before it is
// stored (V2 shell `Pf(doc, '')` via `uu`, legacy/app.zh-Hant.html L5765): known node types with
// size limits, at most 500 nodes / 1000 lines / 12 lanes, colours and widths from the editor's
// palettes, yes / no labels as Y / N, lines only between existing nodes. Anything unreadable
// becomes an empty flowchart (V2 `Qi`). The editor itself is vendor code (vendor/flowchart-editor).
import type { FlowchartDoc } from '../../io/schema-types';

type Raw = Record<string, unknown>;

/** Node types and default sizes (V2 Ta). */
export const NODE_TYPES: Record<string, { w: number; h: number }> = {
  terminator: { w: 140, h: 40 }, process: { w: 160, h: 60 }, decision: { w: 160, h: 100 }, io: { w: 180, h: 60 },
  subprocess: { w: 180, h: 60 }, document: { w: 160, h: 80 }, delay: { w: 140, h: 60 }, connector: { w: 40, h: 40 },
  image: { w: 240, h: 160 }, note: { w: 180, h: 60 },
};
const NODE_COLOURS = new Set(['slate', 'teal', 'blue', 'amber', 'rose', 'violet']);   // V2 Rf ('auto' = none)
const LINE_COLOURS = new Set(['slate', 'blue', 'teal', 'amber', 'rose', 'ink']);       // V2 _d
const WIDTHS = new Set(['thin', 'normal', 'bold']);                                    // V2 Sd

export const emptyFlowchart = (): FlowchartDoc => ({ title: '', lanes: [], nodes: [], edges: [] });

let seq = Date.now() % 1e5;
const newId = (p: string) => p + (++seq).toString(36);
const side = (s: unknown) => (s === 't' || s === 'r' || s === 'b' || s === 'l' ? s : null);
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object';

function clean(t: Raw, title = ''): FlowchartDoc {
  if (!Array.isArray(t.nodes) || !Array.isArray(t.edges)) throw new Error('format');
  const nodes = (t.nodes as unknown[]).filter((s): s is Raw => isObj(s) && typeof s.type === 'string' && s.type in NODE_TYPES && typeof s.id === 'string').slice(0, 500).map(s => {
    const type = s.type as string, image = type === 'image';
    return {
      id: (s.id as string).slice(0, 80), type, text: String(s.text || '').slice(0, 300), x: +(s.x as number) || 0, y: +(s.y as number) || 0,
      w: Math.max(30, Math.min(image ? 1600 : 800, +(s.w as number) || NODE_TYPES[type].w)),
      h: Math.max(20, Math.min(image ? 1600 : 600, +(s.h as number) || NODE_TYPES[type].h)),
      color: NODE_COLOURS.has(s.color as string) ? s.color : null,
      lane: typeof s.lane === 'string' ? s.lane : null,
      img: typeof s.img === 'string' ? s.img.slice(0, 60) : null,
      att: typeof s.att === 'string' ? s.att.slice(0, 60) : null,
      alt: String(s.alt || '').slice(0, 200), border: !!s.border,
    };
  });
  const ids = new Set(nodes.map(n => n.id));
  // \u662f / \u5426 = yes / no in Chinese
  const label = (p: string) => (/^(\u662f|yes)$/i.test(p) ? 'Y' : /^(\u5426|no)$/i.test(p) ? 'N' : p);
  const edges = (t.edges as unknown[]).filter((s): s is Raw => isObj(s) && ids.has(s.from as string) && ids.has(s.to as string) && s.from !== s.to).slice(0, 1000).map(s => ({
    id: typeof s.id === 'string' ? s.id : newId('e'), from: s.from, to: s.to,
    label: label(String(s.label || '').trim()).slice(0, 60),
    color: LINE_COLOURS.has(s.color as string) ? s.color : null, width: WIDTHS.has(s.width as string) ? s.width : null,
    fromSide: side(s.fromSide), toSide: side(s.toSide), dash: !!s.dash,
  }));
  const lanes = (Array.isArray(t.lanes) ? t.lanes as unknown[] : []).filter((s): s is Raw => isObj(s) && typeof s.id === 'string').slice(0, 12)
    .map(s => ({ id: s.id, title: String(s.title || '').slice(0, 40), w: Math.max(140, Math.min(800, +(s.w as number) || 260)) }));
  const l = isObj(t.lineDefault) ? t.lineDefault : {};
  const lineDefault = { color: LINE_COLOURS.has(l.color as string) ? l.color : null, width: WIDTHS.has(l.width as string) ? l.width : null, dash: !!l.dash };
  return { title: String(t.title || title).slice(0, 80), lanes, nodes, edges, lineDefault };
}

/** The document as V2 stored it; an unreadable one becomes an empty flowchart (V2 uu). */
export function sanitizeFlowchart(raw: unknown): FlowchartDoc {
  try { return isObj(raw) ? clean(raw) : emptyFlowchart(); } catch { return emptyFlowchart(); }
}
