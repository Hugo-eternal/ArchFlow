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

  // v2-fix D22: only the live helper versions remain; the shell's #scheduleAuto button runs the L736 auto-fit
  it('schedule helpers are the live versions and #scheduleAuto runs the current auto-fit', async () => {
    const r = await app.eval(() => {
      const fns = { storeWorkspace, allowedWorkspace, scheduleTask, taskHeight, graphBounds, graphAutoFit };
      const types = Object.fromEntries(Object.entries(fns).map(([k, f]) => [k, typeof f]));
      document.getElementById('scheduleAuto').click();
      return { types, notice: document.getElementById('notice').textContent, h: taskHeight(model.nodes[0]) === scheduleMetrics(model.nodes[0]).height };
    });
    expect(Object.values(r.types).every(t => t === 'function')).toBe(true);
    expect(r.notice).toContain('全部圓點與任務框');
    expect(r.h).toBe(true);
    expect(app.errors).toEqual([]);
  });
});
