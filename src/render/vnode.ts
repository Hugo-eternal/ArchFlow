// A tiny DOM-independent element tree. render/* builds VNodes from the model; the canvas mounts
// them as SVG elements and export/ (3.22) serialises them as SVG markup — one drawing code
// path for both (V2 drew HTML on the canvas and rebuilt an SVG from the DOM for export).
export type Attrs = Record<string, string | number | undefined>;
export interface VNode { tag: string; attrs: Attrs; children: VNode[]; text?: string }

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag: string, attrs: Attrs = {}, children: (VNode | null | false | undefined)[] | string = []): VNode {
  return typeof children === 'string'
    ? { tag, attrs, children: [], text: children }
    : { tag, attrs, children: children.filter((c): c is VNode => !!c) };
}

/** Round to 0.01 so output is stable and compact. */
export const r2 = (v: number) => Math.round(v * 100) / 100;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** SVG markup (attributes in insertion order; undefined attributes left out). */
export function toMarkup(n: VNode): string {
  const attrs = Object.entries(n.attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('');
  const inner = n.text !== undefined ? esc(n.text) : n.children.map(toMarkup).join('');
  return `<${n.tag}${attrs}>${inner}</${n.tag}>`;
}

/** Real SVG elements. Text is always set as textContent (never parsed as markup). */
export function mount(n: VNode, doc: Document = document): SVGElement {
  const el = doc.createElementNS(SVG_NS, n.tag) as SVGElement;
  for (const [k, v] of Object.entries(n.attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  if (n.text !== undefined) el.textContent = n.text;
  else for (const c of n.children) el.append(mount(c, doc));
  return el;
}

/** Depth-first search. */
export function find(n: VNode, pred: (n: VNode) => boolean, out: VNode[] = []): VNode[] {
  if (pred(n)) out.push(n);
  for (const c of n.children) find(c, pred, out);
  return out;
}
