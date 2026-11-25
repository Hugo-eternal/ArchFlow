// module: io — test-only V2 → V3 converter (tests/tools/v2-to-v3.ts) on the five golden fixtures.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { convertProject } from '../tools/v2-to-v3';
import type { BlockDiagram, ScheduleData } from '../../src/io/schema-types';

const TYPES = ['function', 'power', 'schedule', 'sequence', 'flowchart'] as const;
const load = (t: string) => JSON.parse(fs.readFileSync(`tests/golden/${t}/project.json`, 'utf8'));

// keys that must never appear in a V3 file (audit §2: renamed, merged, derived or dropped)
const V2_ONLY = /^(af[A-Z]\w*|heading|review|ioConfig|showNote|note_|schedule|scheduleGraph|graphVersion|baseX|baseY|axisX|axisY|axisBaseX|axisBaseY|graphLane|graphDepth|cardDx|cardDy|axisDx|axisDy|timeType|startDate|endDate|deadline|timeMode|manualDays|showMetrics|showLabel|manual|nodes|edges|wiringMode|archflowLocalization|applicationVersion|cameras|version|diagram)$/;
function v2Keys(v: unknown, path = '', out: string[] = [], inVendor = false): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => v2Keys(x, `${path}[${i}]`, out, inVendor));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    const vendor = inVendor || /^\.designs\[\d+\]\.data$/.test(path) && ['sequence', 'flowchart'].includes((v as { type?: string }).type ?? '');
    if (!inVendor && V2_ONLY.test(k)) out.push(`${path}.${k}`);
    v2Keys(x, `${path}.${k}`, out, vendor || (inVendor));
  }
  return out;
}

describe('V2 → V3 converter', () => {
  it('the V2-key scanner detects leftovers (guard for the checks below)', () => {
    expect(v2Keys({ designs: [{ type: 'function', data: { blocks: [{ afLocked: true, review: false }], heading: null } }] }))
      .toEqual(['.designs[0].data.blocks[0].afLocked', '.designs[0].data.blocks[0].review', '.designs[0].data.heading']);
  });

  for (const type of TYPES) {
    it(`${type}: converts the golden fixture without V2-only fields`, async () => {
      const v2 = load(type);
      const v3 = convertProject(v2);
      expect(v3.schemaVersion).toBe(3);
      expect(v3.project.name).toBe(v2.project.name);
      expect(v3.activeDesignId).toBe(v2.activeDesignId);
      expect(v3.designs.map(d => [d.id, d.name, d.type])).toEqual(v2.designs.map((d: { id: string; name: string; type: string }) => [d.id, d.name, d.type]));
      // vendor documents (sequence / flowchart) are stored untouched, so only check the rest
      const scan = { ...v3, designs: v3.designs.map(d => (d.type === 'sequence' || d.type === 'flowchart' ? { ...d, data: {} } : d)) };
      expect(v2Keys(scan)).toEqual([]);
      await expect(JSON.stringify(v3, null, 2) + '\n').toMatchFileSnapshot(`../golden/${type}/__snapshots__/project.v3.json`);
    });
  }

  it('function: blocks, ports, parts, connector, frames, routes and texts map one to one', () => {
    const v2 = load('function').designs[0].diagram;
    const d = convertProject(load('function')).designs[0].data as BlockDiagram;
    expect(d.blocks).toHaveLength(v2.nodes.length);
    expect(d.wires).toHaveLength(v2.edges.length);
    expect(d.blocks.flatMap(b => b.ports)).toHaveLength(v2.nodes.flatMap((n: { ports: unknown[] }) => n.ports).length);
    expect(new Set(d.blocks.map(b => b.part?.kind).filter(Boolean))).toEqual(new Set(['conn', 'led', 'res', 'gnd']));
    const conn = d.blocks.find(b => b.connector)!;
    expect(conn.connector).toMatchObject({ kind: 'fpc', side: 'both', pins: ['VDD', 'GND', 'LVDS+', 'LVDS−', 'BL_EN', 'BL_PWM'] });
    expect(conn.ports.every(p => typeof p.pin === 'number' && (p.end === 'l' || p.end === 'r'))).toBe(true);
    expect(d.frames).toEqual([{ id: 'frame1', title: 'LCD 面板', x: 230, y: -70, w: 800, h: 480, style: 'dash', color: 'teal' }]);
    const routed = v2.edges.find((e: { afRouteOnly?: unknown }) => e.afRouteOnly);
    expect(d.wires.find(w => w.id === routed.id)!.route).toEqual(routed.afRouteOnly.points);
    expect(d.grid).toEqual({ size: 10, show: true, snap: true });
    expect(d.texts[0]).toMatchObject({ text: 'Golden: LCD module', align: 'left', background: 'transparent' });
  });

  it('power: metrics, roles and wire electrical values', () => {
    const d = convertProject(load('power')).designs[0].data as BlockDiagram;
    expect(new Set(d.blocks.map(b => b.role))).toEqual(new Set(['source', 'converter', 'load']));
    const neg = d.blocks.find(b => b.metrics.voltage?.value === '-12')!;
    expect(neg.metrics.voltage).toEqual({ value: '-12', show: true });
    expect(d.wires.filter(w => w.electrical).map(w => w.electrical)).toEqual([
      { voltage: '12', current: '1', show: true },
      { voltage: '5', current: '0.9', show: true },
    ]);
    expect(d.theme).toMatchObject({ latinFont: 'Source Han Sans TC', title: 20 });
  });

  it('schedule: task times, statuses, manual interval; layout caches dropped', () => {
    const v2 = load('schedule').designs[0].diagram;
    const d = convertProject(load('schedule')).designs[0].data as ScheduleData;
    expect(d.tasks).toHaveLength(v2.nodes.length);
    expect(d.tasks[0]).toMatchObject({ title: '規劃', time: { type: 'range', start: '2026-01-05', end: '2026-01-12' }, status: 'done', offset: { card: { x: 0, y: 0 }, axis: { x: 0, y: 0 } } });
    expect(d.tasks.at(-1)).toMatchObject({ time: { type: 'deadline' }, milestone: true });
    expect(d.links.find(l => l.days.mode === 'manual')!.days).toEqual({ mode: 'manual', value: 3 });
    expect(d.rules).toEqual({ endpoint: 'start', count: 'difference' });
    expect(Object.keys(d.tasks[0])).not.toContain('axisX');
  });

  it('sequence / flowchart: editor documents are stored untouched', () => {
    for (const [type, key] of [['sequence', 'sequence'], ['flowchart', 'flowchart']] as const) {
      const v2 = load(type);
      expect(convertProject(v2).designs[0].data).toEqual(v2.designs[0].diagram[key]);
    }
  });

  it('refuses anything that is not a V2.10.1 (version 5) project', () => {
    expect(() => convertProject({ version: 4, diagrams: {} })).toThrow();
    expect(() => convertProject({})).toThrow();
  });
});
