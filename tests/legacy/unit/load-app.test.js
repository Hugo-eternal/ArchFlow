// module: core — the test helper can drive the V2.10.1 engine in Chromium.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openApp } from '../../helpers/load-app.js';

describe('load-app helper', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(async () => { await app?.close(); });

  it('exposes the engine globals', async () => {
    const types = await app.eval(() => ['findPath', 'validateDiagram', 'projectData', 'createWorkspaceProject', 'autoArrange']
      .map(n => typeof window[n]));
    expect(types).toEqual(['function', 'function', 'function', 'function', 'function']);
  });

  it('passes arguments and returns values', async () => {
    const ps = await app.eval((a, b) => findPath(a, b, []), { x: 0, y: 0 }, { x: 100, y: 50 });
    expect(ps[0]).toEqual({ x: 0, y: 0 });
    expect(ps.at(-1)).toEqual({ x: 100, y: 50 });
  });

  it('creates a project without page errors', async () => {
    await app.createProject('function');
    const data = await app.eval(() => projectData());
    expect(data.designs[0].type).toBe('function');
    expect(app.errors).toEqual([]);
  });
});
