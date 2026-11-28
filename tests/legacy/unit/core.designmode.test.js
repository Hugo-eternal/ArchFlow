// module: core — v2-fix M2: designMode() is the single function/power decision.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('designMode()', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  it('falls back to the V1 workspace before a project is open', async () => {
    expect(await app.eval(() => [designMode(), activeWorkspace])).toEqual(['function', 'circuit']);
  });

  for (const type of ['function', 'power', 'schedule', 'sequence', 'flowchart']) {
    it(`${type}: follows the open design and matches the old activeWorkspace test`, async () => {
      await app.createProject(type);
      const r = await app.eval(() => ({ mode: designMode(), power: designMode() === 'power', old: activeWorkspace === 'current' }));
      expect(r.mode).toBe(type);
      expect(r.power).toBe(r.old);
    });
  }
});
