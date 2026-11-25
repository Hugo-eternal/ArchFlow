// module: export — test-only structural SVG comparison (tests/tools/svg-compare.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { compareSvg, V2_COLOR_ROLES, V3_COLOR_ROLES, type SvgElement } from '../tools/svg-compare';

const golden = (t: string): SvgElement[] => JSON.parse(fs.readFileSync(`tests/golden/${t}/__snapshots__/export.svg.json`, 'utf8')).elements;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const shift = (v: unknown, dx: number) => (typeof v === 'string' ? v.replace(/-?\d+(?:\.\d+)?/g, n => String(Number(n) + dx)) : v);
const ROLES = { ...V2_COLOR_ROLES, ...V3_COLOR_ROLES };

describe('compareSvg', () => {
  for (const t of ['function', 'power', 'schedule']) {
    it(`${t}: a golden export equals itself`, () => {
      expect(compareSvg(golden(t), golden(t))).toEqual({ equal: true, diffs: [] });
    });
  }

  it('ignores element order and nesting depth', () => {
    const a = golden('function');
    const b = clone(a).reverse().map(e => ({ ...e, depth: 0 }));
    expect(compareSvg(a, b).equal).toBe(true);
  });

  it('treats moves within the tolerance as equal and beyond it as different', () => {
    const a = golden('function');
    const moved = (dx: number) => clone(a).map(e => (e.tag === 'rect' ? { ...e, x: shift(e.x, dx) } : e));
    expect(compareSvg(a, moved(0.6)).equal).toBe(true);
    const far = compareSvg(a, moved(3));
    expect(far.equal).toBe(false);
    expect(far.diffs[0]).toMatch(/<rect.*moved: geometry differs by 3\.00 px/);
  });

  it('reports a missing element and a changed text', () => {
    const a = golden('function');
    const b = clone(a);
    const i = b.findIndex(e => e.tag === 'path');
    b.splice(i, 1);
    const ti = b.findIndex(e => e.text);
    const oldText = String(b[ti].text);
    b[ti].text = 'changed';
    const r = compareSvg(a, b);
    expect(r.equal).toBe(false);
    expect(r.diffs).toContain(`count <path>: expected ${a.filter(e => e.tag === 'path').length}, got ${a.filter(e => e.tag === 'path').length - 1}`);
    expect(r.diffs).toContain(`missing text "${oldText}"`);
    expect(r.diffs).toContain('unexpected text "changed"');
  });

  it('a different path shape is never "close enough"', () => {
    const a: SvgElement[] = [{ tag: 'path', d: 'M0 0L10 0' }];
    expect(compareSvg(a, [{ tag: 'path', d: 'M0 0L10 0L10 1' }]).equal).toBe(false);
  });

  it('compares paint by role: a V2 hex and the matching V3 token are the same', () => {
    const v2: SvgElement[] = [{ tag: 'path', d: 'M0 0L50 0', stroke: '#334E70', fill: 'none' }];
    expect(compareSvg(v2, [{ tag: 'path', d: 'M0 0L50 0', stroke: 'var(--wire-signal)', fill: 'transparent' }], { colorRoles: ROLES }).equal).toBe(true);
    const r = compareSvg(v2, [{ tag: 'path', d: 'M0 0L50 0', stroke: 'var(--wire-power)', fill: 'none' }], { colorRoles: ROLES });
    expect(r.diffs).toEqual(['<path> stroke: expected wire-signal, got wire-power']);
  });

  it('can ignore attributes', () => {
    const a: SvgElement[] = [{ tag: 'rect', x: '0', y: '0', width: '10', height: '10', fill: '#fff' }];
    const b: SvgElement[] = [{ tag: 'rect', x: '0', y: '0', width: '10', height: '10', fill: '#000' }];
    expect(compareSvg(a, b).equal).toBe(false);
    expect(compareSvg(a, b, { ignore: ['fill'] }).equal).toBe(true);
  });
});
