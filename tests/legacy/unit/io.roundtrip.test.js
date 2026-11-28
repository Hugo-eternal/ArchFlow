// module: io — save → load round trip through the real file input (#file) for every design type.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

const TYPES = ['function', 'power', 'schedule', 'sequence', 'flowchart'];

async function saveAndReload(app) {
  const saved = await app.eval(() => projectData());
  const dialogs = [];
  const onDialog = async d => { dialogs.push(d.message()); await d.accept(); };
  app.page.on('dialog', onDialog);
  await app.page.setInputFiles('#file', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await app.page.waitForTimeout(800);
  app.page.off('dialog', onDialog);
  const loaded = await app.eval(() => projectData());
  return { saved, loaded, dialogs };
}

// camera is view state, not content; compare everything else
const content = p => JSON.parse(JSON.stringify({ ...p, camera: undefined, cameras: undefined, designs: p.designs.map(d => ({ ...d, camera: undefined })) }));

// every value present in `a` is present and equal in `b` (b may add defaults); returns mismatching paths
function missingFrom(a, b, path = '') {
  if (a === null || typeof a !== 'object') return Object.is(a, b) ? [] : [path || '(root)'];
  if (b === null || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return [path || '(root)'];
  if (Array.isArray(a) && a.length !== b.length) return [path + '.length'];
  return Object.keys(a).flatMap(k => missingFrom(a[k], b[k], path + '.' + k));
}
// array indexes collapsed so the list does not depend on how many items an example has
const lost = (a, b) => [...new Set(missingFrom(a, b).map(p => p.replace(/\.\d+(?=\.|$)/g, '[]')))].sort();

// v2-fix B1: V2.10.1 lost text-box `align` / `background` (function / power) and ALL schedule
// text boxes and the schedule `theme` on reload. Nothing may be lost now.
const KNOWN_LOSS = { function: [], power: [], schedule: [], sequence: [], flowchart: [] };

describe('save → load round trip', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  for (const type of TYPES) {
    it(`${type}: loading keeps every saved value (except known losses), and a second round trip is identical`, async () => {
      await app.createProject(type);
      const first = await saveAndReload(app);
      expect(first.dialogs.filter(m => m.includes('失敗'))).toEqual([]);
      // loading may add default fields (e.g. heading:null, review:false); the only values it
      // changes or drops are the known V2.10.1 losses above
      expect(lost(content(first.saved), content(first.loaded))).toEqual(KNOWN_LOSS[type]);
      const second = await saveAndReload(app);
      expect(content(second.loaded)).toEqual(content(second.saved));
      expect(content(second.saved)).toEqual(content(first.loaded));
      expect(app.errors).toEqual([]);
    });
  }

  it('a project with several designs keeps all of them and the active one', async () => {
    await app.createProject('function');
    // add the other four types through the design manager API used by the shell
    await app.eval(() => {
      const base = designs[0];
      for (const [i, type] of ['power', 'schedule', 'sequence', 'flowchart'].entries()) {
        designs.push({ id: 'd' + i + 'x' + Date.now().toString(36), name: type, type, state: { model: workspaceExample(type === 'power' ? 'current' : type === 'schedule' ? 'schedule' : 'circuit'), past: [], future: [], camera: { x: 0, y: 0, z: 1 } } });
      }
      activateDesign(base.id);
    });
    await app.page.waitForTimeout(400);
    const { saved, loaded } = await saveAndReload(app);
    expect(saved.designs.length).toBe(5);
    expect(loaded.designs.map(d => [d.name, d.type])).toEqual(saved.designs.map(d => [d.name, d.type]));
    expect(loaded.activeDesignId).toBe(saved.activeDesignId);
  });

  // v2-fix B1: every text-box style field survives validation, out-of-range values are clamped or dropped
  for (const type of ['function', 'schedule']) {
    it(`${type}: text boxes keep align, background, font and padding; invalid values are dropped`, async () => {
      await app.createProject(type);
      const r = await app.eval(() => {
        const d = JSON.parse(JSON.stringify(model));
        d.texts = [
          { id: 'tA', text: 'a', x: 1, y: 2, w: 200, size: 14, color: '#112233', bold: true, italic: true, align: 'center', background: '#fff7d6', font: 'Georgia', padding: 12 },
          { id: 'tB', text: 'b', x: 3, y: 4, align: 'justify', background: 'red;x', font: '<b>', padding: 99 },
        ];
        d.theme = { ...defaultTheme, title: 30 };
        const v = validateDiagram(d);
        return { texts: v.texts, theme: v.theme };
      });
      expect(r.texts[0]).toMatchObject({ align: 'center', background: '#fff7d6', font: 'Georgia', padding: 12, bold: true, italic: true });
      expect(r.texts[1]).not.toHaveProperty('align');
      expect(r.texts[1]).not.toHaveProperty('background');
      expect(r.texts[1]).not.toHaveProperty('font');
      expect(r.texts[1].padding).toBe(40);
      expect(r.theme.title).toBe(30);
    });
  }

  // v2-fix B2/D9: V2.10.1 saved '1.8-rc4' (the last of 8 projectData layers won); now one constant.
  it('saved applicationVersion and the on-screen version are the single AF_VERSION constant', async () => {
    await app.createProject('function');
    const r = await app.eval(() => ({
      constant: AF_VERSION,
      saved: projectData().applicationVersion,
      shown: [...document.querySelectorAll('.af-brand-version,.af-release-version')].map(e => e.textContent),
    }));
    expect(r.constant).toMatch(/^V2\.\d+(\.\d+)?(-dev)?$/);
    expect(r.saved).toBe(r.constant);
    expect(r.shown.length).toBeGreaterThan(0);
    expect(new Set(r.shown)).toEqual(new Set([r.constant]));
  });
});
