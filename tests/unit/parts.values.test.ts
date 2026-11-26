// module: designs:function, inspector — step 3.43i: part values (V2 normValue L4268, compared with
// V2's own source) and the common values offered in the panel.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { setLocale } from '../../src/core/i18n';
import { normValue, PARTS } from '../../src/designs/function/parts';
import { Store } from '../../src/core/store';
import { blockInspector } from '../../src/inspector/common';
import { functionDesign } from '../../src/designs/function';
import * as m from '../../src/model/diagram';

beforeEach(() => setLocale('zh-Hant'));

/** V2 normValue + normRail, taken from legacy/app.zh-Hant.html. */
function v2(): (k: string, v: string) => string {
  const html = fs.readFileSync('legacy/app.zh-Hant.html', 'utf8');
  const cut = (name: string) => { const a = html.indexOf(`function ${name}(`); return html.slice(a, html.indexOf('\n }\n', a) + 3); };
  return new Function(`${cut('normRail')}\n${cut('normValue')}\nreturn normValue;`)() as (k: string, v: string) => string;
}

describe('normValue', () => {
  it('matches V2 for every kind and a spread of inputs', () => {
    const ref = v2();
    const inputs = ['10k', '4.7k', '4.7 kohm', '4.7K', '100', '100n', '1u', '10uF', '2.2u', '22 uH', '0.5', '2A', '32.768k', '24M', '12', '3v3', '1V8', '5', '05V', '+12v', 'abc', '', '  10k  ', '1m', '470p', 'x'.repeat(40)];
    // on purpose: V2 turned a trailing k / M into kΩ / MΩ for every kind; V3 only for Ω parts
    const ohmBug = (k: string, v: string) => !['res', 'bead'].includes(k) && /\d\s*[kKmM]\s*$/.test(v.trim());
    for (const p of PARTS) for (const v of inputs) if (!ohmBug(p.kind, v)) expect(normValue(p.kind, v), `${p.kind} ${v}`).toBe(ref(p.kind, v));
    expect(ref('xtal', '32.768k')).toBe('32.768k\u03a9');   // the V2 bug
    expect(normValue('cap', '1m')).toBe('1mF');
    expect(normValue('res', '4.7k')).toBe('4.7kΩ');
    expect(normValue('xtal', '32.768k')).toBe('32.768kHz');
    expect(normValue('vcc', '3v3')).toBe('3.3V');
  });

  it('the value field tidies on commit and offers the preset values', () => {
    let d = m.emptyDiagram();
    const r = functionDesign.commands!.find(c => c.id === 'part.insert.res')!;
    void r;
    d = m.addBlock(d, { ...m.makeBlock(d, { x: 0, y: 0 }), id: 'R', part: { kind: 'res', rot: 0, size: 'M' }, partNumber: '10kΩ', ports: [] }).data;
    const store = new Store();
    store.newProject('P', { type: 'function', name: 'D', data: d });
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const insp = blockInspector(root, store, { debounceMs: 0 });
    insp.show({ kind: 'block', id: 'R' }, functionDesign.inspectorFields!({ kind: 'block', id: 'R' }, d));
    const input = root.querySelector('[data-field="partValue"] input') as HTMLInputElement;
    const list = root.querySelector(`#${input.getAttribute('list')}`)!;
    expect([...list.querySelectorAll('option')].map(o => o.value)).toEqual(PARTS.find(p => p.kind === 'res')!.presets);
    input.value = '2.2k';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect((store.data(store.activeDesignId) as typeof d).blocks[0].partNumber).toBe('2.2kΩ');
  });
});
