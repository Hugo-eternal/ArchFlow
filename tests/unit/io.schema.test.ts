// module: io — V3 src/io/schema.ts (runtime validation of schemaVersion 3 files).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { validateProject, validateData, parseProject, isV3, FILE_LIMITS } from '../../src/io/schema';
import type { SchemaError } from '../../src/io/schema';
import type { BlockDiagram, ProjectFile, ScheduleData } from '../../src/io/schema-types';
import { Store } from '../../src/core/store';
import * as m from '../../src/model/diagram';
import { LIMITS } from '../../src/model/types';

const TYPES = ['function', 'power', 'schedule', 'sequence', 'flowchart'] as const;   // golden fixture names
const golden = (t: string): ProjectFile => JSON.parse(fs.readFileSync(`tests/golden/${t}/__snapshots__/project.v3.json`, 'utf8'));
const errorsOf = (f: unknown): SchemaError[] => { const r = validateProject(f); return r.ok ? [] : r.errors; };
const codes = (f: unknown) => errorsOf(f).map(e => `${e.path} ${e.code}`);
const fn = () => golden('function');
const block = (f: ProjectFile) => (f.designs[0].data as BlockDiagram).blocks[0];

describe('io/schema accepts valid files', () => {
  it.each(TYPES)('golden %s project (V3 form) is valid', t => {
    expect(errorsOf(golden(t))).toEqual([]);
  });

  it('a file written by the store and a diagram built with model functions are valid', () => {
    let d = m.emptyDiagram();
    const A = m.makeBlock(d, { x: 0, y: 0 }); d = m.addBlock(d, A).data;
    const B = m.makeBlock(d, { x: 400, y: 0 }, 'power'); d = m.addBlock(d, B).data;
    d = m.connect(d, { block: A.id, port: A.ports[1].id }, { block: B.id, port: B.ports[0].id }, {}, 'power').data;
    d = m.addText(d, { x: 0, y: 200 }, 'note').data;
    d = m.addFrame(d, { x: -20, y: -20, w: 700, h: 200 }).data;
    d = m.addJunction(d, { x: 300, y: 50 }).data;
    expect(validateData('function', d)).toEqual([]);
    const s = new Store();
    s.newProject('P', { type: 'function', name: 'D', data: d });
    const r = parseProject(JSON.stringify(s.toFile()));
    expect(r.ok).toBe(true);
  });
});

describe('io/schema: one block-diagram type with two views (3.26c)', () => {
  it("'power' is no longer a design type; the golden power project is a function design in the power view", () => {
    const f = golden('power');
    expect([f.designs[0].type, (f.designs[0].data as BlockDiagram).view]).toEqual(['function', 'power']);
    expect(validateData('power' as never, f.designs[0].data)).toEqual([{ path: 'type', code: 'enum' }]);
    (f.designs[0] as { type: string }).type = 'power';
    expect(codes(f)).toEqual(['designs[0].type enum']);
  });

  it('view is required and is function | power', () => {
    const f = fn(), d = f.designs[0].data as Partial<BlockDiagram>;
    (d as { view: string }).view = 'schedule';
    expect(codes(f)).toEqual(['designs[0].data.view enum']);
    delete d.view;
    expect(codes(f)).toEqual(['designs[0].data.view required']);
  });

  it('reserved UI fields are optional and validated (block size / style.color, wire routing / labelOffset, groups)', () => {
    const f = fn(), d = f.designs[0].data as BlockDiagram, b = d.blocks[0], w = d.wires[0];
    b.size = 'M'; b.style.color = 'teal';
    w.routing = 'manual'; w.route = [{ x: 10, y: 20 }]; w.labelOffset = { x: 4, y: -6 };
    d.groups = [{ id: 'grp1', name: 'Power stage', members: [b.id], bounds: { x: 0, y: 0, w: 300, h: 200 } }];
    expect(codes(f)).toEqual([]);
    expect(validateProject(JSON.parse(JSON.stringify(f))).ok).toBe(true);
    (b as { size: string }).size = 'XL'; (w as { routing: string }).routing = 'smart';
    d.groups[0].members.push('nope1');
    expect(codes(f)).toEqual(['designs[0].data.blocks[0].size enum', 'designs[0].data.wires[0].routing enum']);
    b.size = 'S'; w.routing = 'auto';
    expect(codes(f)).toEqual(['designs[0].data.groups[0].members[1] missing-ref']);
    d.groups[0].members.pop(); d.groups[0].id = b.id;
    expect(codes(f)).toEqual(['designs[0].data.groups[0].id duplicate-id']);
    d.groups[0].id = 'grp1';
    // path points live only in `route`; there is no separate waypoints field
    (w as unknown as Record<string, unknown>).waypoints = [{ x: 1, y: 2 }];
    expect(codes(f)).toEqual(['designs[0].data.wires[0].waypoints unknown-key']);
  });
});

describe('io/schema rejects', () => {
  it('V1 / V2 and unversioned files with a version error', () => {
    for (const raw of [{ version: 5, designs: [] }, { version: 4 }, { nodes: [], edges: [] }, { schemaVersion: 2 }]) {
      expect(isV3(raw)).toBe(false);
      expect(errorsOf(raw)[0].code).toBe('version');
    }
    const v2 = JSON.parse(fs.readFileSync('tests/golden/function/project.json', 'utf8'));
    expect(errorsOf(v2)).toEqual([{ path: 'schemaVersion', code: 'version', detail: '5' }]);
    expect(isV3(fn())).toBe(true);
  });

  it('non-JSON, non-objects and files over 8 MB', () => {
    expect(parseProject('{').ok).toBe(false);
    expect(errorsOf(null)[0].code).toBe('type');
    expect(errorsOf([])[0].code).toBe('type');
    const big = JSON.stringify({ ...fn(), pad: 'x'.repeat(FILE_LIMITS.bytes) });
    const r = parseProject(big);
    expect(!r.ok && r.errors[0].code).toBe('too-large');
  });

  it('wrong types, enums, ranges, missing and unknown keys — with paths', () => {
    const cases: [(f: ProjectFile) => void, string][] = [
      [f => { (f as any).project.name = 5; }, 'project.name type'],
      [f => { (f as any).locale = 'fr'; }, 'locale enum'],
      [f => { delete (f as any).app; }, 'app required'],
      [f => { (f as any).applicationVersion = '1.8-rc4'; }, 'applicationVersion unknown-key'],
      [f => { block(f).x = Number.NaN; }, 'designs[0].data.blocks[0].x type'],
      [f => { block(f).x = 2e6; }, 'designs[0].data.blocks[0].x range'],
      [f => { block(f).ports[0].t = 1.5; }, 'designs[0].data.blocks[0].ports[0].t range'],
      [f => { (block(f).ports[0] as any).side = 'x'; }, 'designs[0].data.blocks[0].ports[0].side enum'],
      [f => { (block(f) as any).afFree = true; }, 'designs[0].data.blocks[0].afFree unknown-key'],
      [f => { block(f).title = 'x'.repeat(LIMITS.text + 1); }, 'designs[0].data.blocks[0].title too-long'],
      [f => { block(f).id = 'bad id!'; }, 'designs[0].data.blocks[0].id id'],
      [f => { (f.designs[0].data as BlockDiagram).grid.size = 3; }, 'designs[0].data.grid.size range'],
      [f => { (f.designs[0] as any).type = 'circuit'; }, 'designs[0].type enum'],
      [f => { f.designs = []; }, 'designs too-few'],
      [f => { (f.designs[0] as any).camera.z = 0; }, 'designs[0].camera.z range'],
    ];
    for (const [mutate, expected] of cases) {
      const f = fn(); mutate(f);
      expect(codes(f), expected).toContain(expected);
    }
  });

  it('limits on counts', () => {
    const f = fn(), d = f.designs[0].data as BlockDiagram;
    d.blocks = Array.from({ length: LIMITS.blocks + 1 }, (_, i) => ({ ...structuredClone(d.blocks[0]), id: 'b' + i }));
    expect(codes(f)).toContain('designs[0].data.blocks too-many');
    const g = fn(); (g.designs[0].data as BlockDiagram).blocks[0].ports = Array.from({ length: LIMITS.portsPerBlock + 1 }, (_, i) => ({ ...block(fn()).ports[0], id: 'p' + i }));
    expect(codes(g)).toContain('designs[0].data.blocks[0].ports too-many');
  });

  it('broken references and duplicate ids', () => {
    const f = fn(), d = f.designs[0].data as BlockDiagram;
    d.wires[0].a = { block: d.blocks[0].id, port: 'nope' };
    expect(codes(f)).toContain('designs[0].data.wires[0].a missing-ref');
    const g = fn(); (g.designs[0].data as BlockDiagram).wires[0].b = { junction: 'xmissing' };
    expect(codes(g)).toContain('designs[0].data.wires[0].b missing-ref');
    const h = fn(); const hd = h.designs[0].data as BlockDiagram; hd.blocks[1].id = hd.blocks[0].id;
    expect(codes(h)).toContain('designs[0].data.blocks[1].id duplicate-id');
    const k = fn(); k.activeDesignId = 'xother';
    expect(codes(k)).toContain('activeDesignId missing-ref');
    const s = golden('schedule'); (s.designs[0].data as ScheduleData).links[0].to = 'xgone';
    expect(codes(s)).toContain('designs[0].data.links[0].to missing-ref');
  });

  it('schedule dates and tagged unions', () => {
    const s = golden('schedule'), d = s.designs[0].data as ScheduleData;
    const t = d.tasks.find(x => x.time.type === 'range')!;
    (t.time as any).start = '2026-13-45';
    expect(errorsOf(s).some(e => e.path.endsWith('.time.start') && e.code === 'type')).toBe(true);
    const s2 = golden('schedule'); ((s2.designs[0].data as ScheduleData).tasks[0] as any).time = { type: 'later' };
    expect(codes(s2)).toContain('designs[0].data.tasks[0].time.type enum');
    const s3 = golden('schedule'); (s3.designs[0].data as ScheduleData).links[0].days = { mode: 'manual', value: -1 } as never;
    expect(codes(s3)).toContain('designs[0].data.links[0].days.value range');
  });

  it('vendor documents: outer shape only, extra keys allowed', () => {
    const q = golden('sequence');
    (q.designs[0].data as any).anything = { deep: [1, 2, 3] };
    expect(errorsOf(q)).toEqual([]);
    delete (q.designs[0].data as any).rails;
    expect(codes(q)).toContain('designs[0].data.rails required');
    const fl = golden('flowchart'); (fl.designs[0].data as any).nodes = 'x';
    expect(codes(fl)).toContain('designs[0].data.nodes type');
  });

  it('reports at most 50 errors', () => {
    const f = fn(), d = f.designs[0].data as BlockDiagram;
    for (const b of d.blocks) { (b as any).x = 'a'; (b as any).y = 'b'; (b as any).w = 'c'; (b as any).h = 'd'; }
    expect(errorsOf(f).length).toBeLessThanOrEqual(50);
  });
});
