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

  // v2-fix D8: V2.10.1 converted any junction not named TAPn (e.g. one the user renamed) into
  // direct wires on reload and deleted the junction
  it('a renamed junction survives save and reopen', async () => {
    await app.createProject('function');
    await app.eval(() => {
      // one source feeding two inputs through the junction (a real branch)
      const [e0, e1] = model.edges, j = { id: 'jVbus', name: 'VBUS', x: 0, y: 0 };
      const at = r => { const n = model.nodes.find(n => n.id === r.node), s = size(n); return { x: n.x + s.w / 2, y: n.y + s.h / 2 }; };
      const pa = at(e0.a), pb = at(e0.b); j.x = Math.round((pa.x + pb.x) / 20) * 10; j.y = Math.round((pa.y + pb.y) / 20) * 10 + 200;
      model.junctions.push(j);
      model.edges = [...model.edges.filter(e => e !== e0 && e !== e1),
        { ...clone(e0), id: 'eA', b: { junction: j.id }, manual: null },
        { ...clone(e0), id: 'eB', a: { junction: j.id }, manual: null },
        { ...clone(e1), id: 'eC', a: { junction: j.id }, manual: null }];
      render(); commit();
    });
    expect(await app.eval(() => model.junctions.map(j => j.name))).toEqual(['VBUS']);
    const { saved, loaded } = await saveAndReload(app);
    const d = x => x.designs[0].diagram;
    expect(d(saved).junctions.map(j => j.name)).toEqual(['VBUS']);
    expect(d(loaded).junctions.map(j => j.name)).toEqual(['VBUS']);
    expect(d(loaded).edges.filter(e => e.a.junction === 'jVbus' || e.b.junction === 'jVbus').length).toBe(3);
    expect(app.errors).toEqual([]);
  });

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
