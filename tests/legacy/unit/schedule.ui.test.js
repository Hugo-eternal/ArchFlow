// module: designs:schedule — schedule panel commands that survived the dead-layer clean-up (v2-fix D23).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('schedule appearance command', () => {
  let app;
  beforeAll(async () => { app = await openApp(); await app.createProject('schedule'); });
  afterAll(async () => { await app?.close(); });

  it('openScheduleTemplates is the live (L861) version and opens the appearance section', async () => {
    const r = await app.eval(() => {
      const src = String(openScheduleTemplates);
      openScheduleTemplates();
      return { live: src.includes('appearanceMainFold.open()'), dialog: !!document.getElementById('scheduleTemplates') };
    });
    expect(r).toEqual({ live: true, dialog: false });
    expect(app.errors).toEqual([]);
  });

  // v2-fix D18: axisLayout is now only the L685 version wrapped at L722 (graphVersion 3)
  it('axisLayout runs the live chain', async () => {
    const r = await app.eval(() => { axisLayout(); return { graph: model.scheduleGraph, version: model.graphVersion, refs: model.nodes.every(n => /^T\d{2}$/.test(n.ref)) }; });
    expect(r).toEqual({ graph: true, version: 3, refs: true });
    expect(app.errors).toEqual([]);
  });
});
