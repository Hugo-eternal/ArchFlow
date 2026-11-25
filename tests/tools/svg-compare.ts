// TEST-ONLY structural SVG comparison (docs/v3-plan.md §3.1 R2).
//
// V3 renders the same diagrams with consolidated CSS / design tokens, so byte-for-byte SVG
// equality with the V2 goldens is impossible. Two exports are "the same drawing" when:
//   1. they contain the same number of elements of each tag;
//   2. they contain the same texts (as a multiset);
//   3. every element can be paired with one of the same tag (and text) whose geometry
//      (x, y, width, height, cx, cy, r, x1…y2, d, points, transform) differs by ≤ tolerance;
//   4. paint (fill / stroke) agrees after mapping colours to roles — e.g. V2 '#334e70' and V3
//      'var(--wire-signal)' both mean "signal wire".
// Element order and nesting depth are ignored: V3 may group elements differently.
//
// Input is the array produced by tests/golden/golden.js svgStructure():
//   [{ depth, tag, text?, x?, y?, d?, fill?, stroke?, … }, …]

export interface SvgElement { depth?: number; tag: string; text?: string; [attr: string]: unknown }

export interface CompareOptions {
  /** max absolute difference for every number in geometry attributes (px) */
  tolerance?: number;
  /** colour (lower-case hex, 'none', 'transparent', or 'var(--token)') → role name */
  colorRoles?: Record<string, string>;
  /** attributes to ignore entirely */
  ignore?: string[];
  /** cap on reported differences */
  maxReport?: number;
}

export interface CompareResult { equal: boolean; diffs: string[] }

const GEOMETRY = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'width', 'height', 'd', 'points', 'transform'];
const PAINT = ['fill', 'stroke'];

const numbers = (v: unknown): number[] => (typeof v === 'string' ? [...v.matchAll(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)].map(m => Number(m[0])) : []);
// letters / commands of a path or transform: "M0 0L10 5" → "ML"
const shape = (v: unknown): string => (typeof v === 'string' ? v.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, '').replace(/[\s,]+/g, '') : '');

function geometryDistance(a: SvgElement, b: SvgElement, ignore: Set<string>): number {
  let worst = 0;
  for (const k of GEOMETRY) {
    if (ignore.has(k)) continue;
    const va = a[k], vb = b[k];
    if (va === undefined && vb === undefined) continue;
    if (va === undefined || vb === undefined) return Infinity;
    if (shape(va) !== shape(vb)) return Infinity;
    const na = numbers(va), nb = numbers(vb);
    if (na.length !== nb.length) return Infinity;
    for (let i = 0; i < na.length; i++) worst = Math.max(worst, Math.abs(na[i] - nb[i]));
  }
  return worst;
}

function role(color: unknown, roles: Record<string, string>): string {
  if (typeof color !== 'string') return '(none)';
  const c = color.trim().toLowerCase();
  return roles[c] ?? c;
}

const label = (e: SvgElement) => `<${e.tag}${e.text ? ` "${String(e.text).slice(0, 30)}"` : ''}${['x', 'y', 'cx', 'cy'].filter(k => e[k] !== undefined).map(k => ` ${k}=${e[k]}`).join('')}>`;

export function compareSvg(expected: SvgElement[], actual: SvgElement[], opts: CompareOptions = {}): CompareResult {
  const tol = opts.tolerance ?? 1;
  const roles = Object.fromEntries(Object.entries(opts.colorRoles ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const ignore = new Set(opts.ignore ?? []);
  const max = opts.maxReport ?? 50;
  const diffs: string[] = [];
  const add = (s: string) => { if (diffs.length < max) diffs.push(s); };

  // 1. tag counts
  const count = (list: SvgElement[]) => list.reduce((m, e) => m.set(e.tag, (m.get(e.tag) ?? 0) + 1), new Map<string, number>());
  const ce = count(expected), ca = count(actual);
  for (const tag of new Set([...ce.keys(), ...ca.keys()])) {
    if ((ce.get(tag) ?? 0) !== (ca.get(tag) ?? 0)) add(`count <${tag}>: expected ${ce.get(tag) ?? 0}, got ${ca.get(tag) ?? 0}`);
  }

  // 2. texts
  const texts = (list: SvgElement[]) => list.filter(e => e.text).map(e => String(e.text)).sort();
  const te = texts(expected), ta = texts(actual);
  const missing = [...te], extra: string[] = [];
  for (const t of ta) { const i = missing.indexOf(t); if (i >= 0) missing.splice(i, 1); else extra.push(t); }
  for (const t of missing) add(`missing text "${t}"`);
  for (const t of extra) add(`unexpected text "${t}"`);

  // 3 + 4. pair elements of the same tag and text by nearest geometry, then compare paint
  const pool = actual.map((e, i) => ({ e, i, used: false }));
  for (const e of expected) {
    // nearest geometry first; among equally near candidates prefer one whose paint agrees
    const paintMatches = (c: SvgElement) => PAINT.every(k => ignore.has(k) || role(e[k], roles) === role(c[k], roles));
    let best: (typeof pool)[number] | null = null, bestD = Infinity, bestPaint = false;
    for (const c of pool) {
      if (c.used || c.e.tag !== e.tag || (c.e.text ?? '') !== (e.text ?? '')) continue;
      const d = geometryDistance(e, c.e, ignore);
      const p = paintMatches(c.e);
      if (d < bestD || (d === bestD && p && !bestPaint)) { bestD = d; best = c; bestPaint = p; if (d === 0 && p) break; }
    }
    if (!best) { if (ce.get(e.tag) === ca.get(e.tag)) add(`no counterpart for ${label(e)}`); continue; }
    best.used = true;
    if (bestD > tol) add(`${label(e)} moved: geometry differs by ${bestD === Infinity ? 'shape' : bestD.toFixed(2) + ' px'} (tolerance ${tol})`);
    for (const k of PAINT) {
      if (ignore.has(k)) continue;
      const re = role(e[k], roles), ra = role(best.e[k], roles);
      if (re !== ra) add(`${label(e)} ${k}: expected ${re}, got ${ra}`);
    }
  }
  return { equal: diffs.length === 0, diffs };
}

/** Colour → role table for V2 exports, from the V2 palette (legacy L285, af15-theme). */
export const V2_COLOR_ROLES: Record<string, string> = {
  '#334e70': 'wire-signal',
  '#a14d0a': 'wire-power',
  '#6d28d9': 'wire-clock',
  '#0f766e': 'wire-bus',
  '#536b8c': 'wire-default',
  'none': 'none',
  'transparent': 'none',
};

/** Colour → role table for V3 exports: tokens map to the same role names. */
export const V3_COLOR_ROLES: Record<string, string> = {
  'var(--wire-signal)': 'wire-signal',
  'var(--wire-power)': 'wire-power',
  'var(--wire-clock)': 'wire-clock',
  'var(--wire-bus)': 'wire-bus',
  'none': 'none',
  'transparent': 'none',
};
