// module: designs:function — part values typed in the properties panel get their unit (v2-fix B5).
// V2.10.1 turned every bare k / M into ohms, so a 32.768k crystal became "32.768kΩ".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('part value units', () => {
  let app;
  beforeAll(async () => { app = await openApp(); await app.createProject('function', { examples: false }); });
  afterAll(async () => { await app?.close(); });

  const typed = (part, text) => app.eval(([part, text]) => {
    const v = document.getElementById('view').getBoundingClientRect();
    window.afLib.insert(part, { x: v.left + v.width / 2, y: v.top + v.height / 2 });
    const n = model.nodes.at(-1);
    select({ type: 'node', id: n.id });
    const input = [...document.querySelectorAll('#inspector label')].find(l => /^(標示|名稱|電壓)/.test(l.textContent.trim()))?.querySelector('input');
    input.value = text;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const shown = input.value;
    const stored = n.partNumber ?? n.title;
    select(null); model.nodes = model.nodes.filter(x => x !== n); render(); commit();
    return { shown, stored };
  }, [part, text]);

  for (const [part, text, want] of [
    ['res', '4.7k', '4.7kΩ'], ['res', '10K', '10kΩ'], ['res', '2M2', '2M2'], ['bead', '1k', '1kΩ'],
    ['xtal', '32.768k', '32.768kHz'], ['xtal', '24M', '24MHz'], ['xtal', '32.768K', '32.768kHz'],
    ['fuse', '500m', '500mA'], ['cap', '100n', '100nF'], ['ind', '4.7u', '4.7µH'],
  ]) {
    it(`${part}: "${text}" → "${want}"`, async () => {
      const r = await typed(part, text);
      expect(r.shown).toBe(want);
      expect(app.errors).toEqual([]);
    });
  }
});
