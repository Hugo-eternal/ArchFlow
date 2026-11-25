// Turn the canvas styling (src/styles/canvas.css + design tokens) into SVG presentation
// attributes, so an exported SVG looks the same in viewers that ignore <style> or CSS custom
// properties (PowerPoint, Word, Inkscape import, image previews). V2 got the same effect by
// copying computed styles from the live DOM (exportSvgDocument L390 and the clean-up layers
// L1469–L1856); V3 resolves the same rules without a DOM, so export also works in tests.
//
// Supported CSS (enough for canvas.css, checked by tests/unit/export.test.ts): plain rule
// blocks, comma-separated selector lists, compound selectors of tag / .class / [attr="v"],
// descendant combinators (space), var(--x[, fallback]) and inline `style` declarations.
import type { VNode } from '../render/vnode';

export type Theme = 'light' | 'dark';
type Decls = [prop: string, value: string][];

interface Compound { tag?: string; classes: string[]; attrs: [string, string | undefined][] }
interface Rule { selector: Compound[]; specificity: number; order: number; decls: Decls }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function parseDecls(body: string): Decls {
  const out: Decls = [];
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    if (prop && value) out.push([prop, value]);
  }
  return out;
}

/** Custom properties of a theme from tokens.css (light = `:root`, dark = light + `:root[data-theme="dark"]`). */
export function parseTokens(css: string, theme: Theme = 'light'): Map<string, string> {
  const src = stripComments(css);
  const block = (re: RegExp) => { const m = src.match(re); return m ? parseDecls(m[1]) : []; };
  const map = new Map<string, string>();
  for (const [k, v] of block(/(?:^|\n)\s*:root\s*\{([^}]*)\}/)) if (k.startsWith('--')) map.set(k, v);
  if (theme === 'dark') for (const [k, v] of block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)) if (k.startsWith('--')) map.set(k, v);
  return map;
}

function parseCompound(s: string): Compound {
  const c: Compound = { classes: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(s))) {
    pos = re.lastIndex;
    if (m[1]) c.tag = m[1];
    else if (m[2]) c.classes.push(m[2]);
    else c.attrs.push([m[3], m[4]]);
  }
  if (pos !== s.length) throw new Error(`unsupported selector: ${s}`);
  return c;
}

/** Rules of a stylesheet (no at-rules). Throws on selectors it cannot evaluate. */
export function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const src = stripComments(css);
  if (/@/.test(src)) throw new Error('at-rules are not supported in canvas styles');
  let order = 0;
  for (const m of src.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = parseDecls(m[2]);
    for (const sel of m[1].split(',')) {
      const selector = sel.trim().split(/\s+/).map(parseCompound);
      const specificity = selector.reduce((n, c) => n + (c.classes.length + c.attrs.length) * 10 + (c.tag ? 1 : 0), 0);
      rules.push({ selector, specificity, order: order++, decls });
    }
  }
  return rules;
}

const classesOf = (n: VNode) => String(n.attrs.class ?? '').split(/\s+/).filter(Boolean);
function matchesCompound(n: VNode, c: Compound): boolean {
  if (c.tag && n.tag !== c.tag) return false;
  const cls = classesOf(n);
  if (!c.classes.every(x => cls.includes(x))) return false;
  return c.attrs.every(([k, v]) => n.attrs[k] !== undefined && (v === undefined || String(n.attrs[k]) === v));
}
function matches(chain: readonly VNode[], sel: Compound[]): boolean {
  let i = chain.length - 1;
  if (!matchesCompound(chain[i], sel[sel.length - 1])) return false;
  for (let s = sel.length - 2; s >= 0; s--) {
    i--;
    while (i >= 0 && !matchesCompound(chain[i], sel[s])) i--;
    if (i < 0) return false;
  }
  return true;
}

/** Resolve var() references (nested, with fallbacks) against custom properties. */
export function resolveVars(value: string, vars: ReadonlyMap<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`var() cycle in ${value}`);
  let out = '', i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let level = 1, j = at + 4;
    for (; j < value.length && level; j++) { if (value[j] === '(') level++; else if (value[j] === ')') level--; }
    const inner = value.slice(at + 4, j - 1);
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
    const v = vars.get(name) ?? fallback;
    if (v === undefined) throw new Error(`undefined custom property ${name}`);
    out += resolveVars(v, vars, depth + 1);
    i = j;
  }
  return out;
}

/** Properties written as presentation attributes; everything else stays in `style`. */
const PRESENTATION = new Set([
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'stroke-opacity',
  'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'letter-spacing',
]);
/** Editor-only properties dropped from exports. */
const DROP = new Set(['pointer-events', 'cursor', 'transition', 'user-select']);

const unitless = (prop: string, v: string) =>
  (prop === 'stroke-width' || prop === 'font-size') && /^-?\d+(\.\d+)?px$/.test(v) ? v.slice(0, -2) : v;

export interface InlineOptions {
  rules: readonly Rule[];
  vars: ReadonlyMap<string, string>;
  /** Drop `class` and `data-*` attributes (default true). */
  stripMeta?: boolean;
}

/** A copy of `root` with every matching rule written onto the elements. */
export function inlineStyles(root: VNode, o: InlineOptions): VNode {
  const strip = o.stripMeta ?? true;
  const walk = (n: VNode, chain: VNode[], vars: ReadonlyMap<string, string>): VNode => {
    const here = [...chain, n];
    const matched = o.rules.filter(r => matches(here, r.selector)).sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    const decls: Decls = matched.flatMap(r => r.decls);
    if (typeof n.attrs.style === 'string') decls.push(...parseDecls(n.attrs.style));
    // custom properties first (they inherit), then the rest resolved against them
    let env = vars;
    const custom = decls.filter(([k]) => k.startsWith('--'));
    if (custom.length) {
      const next = new Map(vars);
      for (const [k, v] of custom) next.set(k, v);
      env = next;
    }
    const attrs: VNode['attrs'] = {};
    for (const [k, v] of Object.entries(n.attrs)) {
      if (k === 'style') continue;
      if (strip && (k === 'class' || k.startsWith('data-'))) continue;
      attrs[k] = v;
    }
    const rest: string[] = [];
    const props = new Map<string, string>();
    for (const [k, v] of decls) if (!k.startsWith('--') && !DROP.has(k)) props.set(k, v);
    for (const [k, v] of props) {
      const value = unitless(k, resolveVars(v, env));
      if (PRESENTATION.has(k)) attrs[k] = value;
      else rest.push(`${k}:${value}`);
    }
    if (rest.length) attrs.style = rest.join(';');
    return n.text !== undefined
      ? { tag: n.tag, attrs, children: [], text: n.text }
      : { tag: n.tag, attrs, children: n.children.map(c => walk(c, here, env)) };
  };
  return walk(root, [], o.vars);
}
