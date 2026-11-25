// module: io — V3 src/io/project-file.ts and src/io/migrate.ts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readProjectText, readProjectBlob, openProjectText, saveProject, fileNameFor, openMessage, projectText } from '../../src/io/project-file';
import { migrate } from '../../src/io/migrate';
import { FILE_LIMITS } from '../../src/io/schema';
import { Store } from '../../src/core/store';
import { t } from '../../src/core/i18n';
import type { BlockDiagram, ProjectFile, ScheduleData } from '../../src/io/schema-types';

const TYPES = ['function', 'power', 'schedule', 'sequence', 'flowchart'] as const;
const goldenText = (t: string) => fs.readFileSync(`tests/golden/${t}/__snapshots__/project.v3.json`, 'utf8');
const golden = (t: string): ProjectFile => JSON.parse(goldenText(t));
const loaded = (f: ProjectFile) => { const s = new Store(); s.load(f); return s; };

describe('save ↔ open round trip', () => {
  it.each(TYPES)('%s: open → save → open keeps every value', t => {
    const s = new Store();
    const r = openProjectText(s, goldenText(t));
    expect(r.ok).toBe(true);
    expect(s.dirty).toBe(false);
    const saved = saveProject(s);
    const again = readProjectText(saved.text);
    expect(again.ok && again.file).toEqual({ ...golden(t), app: s.toFile().app, locale: s.toFile().locale });
  });

  it('text box align / background and schedule texts / theme survive (V2 lost them, step 2.5)', () => {
    const f = golden('function');
    (f.designs[0].data as BlockDiagram).texts.push({ id: 'xtxt', text: 'Note', x: 1, y: 2, w: 180, size: 16, color: '#243e5d', bold: true, italic: false, align: 'center', background: '#fff7d6' });
    const sf = golden('schedule'), sd = sf.designs[0].data as ScheduleData;
    sd.texts.push({ id: 'xstxt', text: 'Kick-off', x: 0, y: -40, w: 200, size: 14, color: '#333333', bold: false, italic: true, align: 'right', background: 'transparent' });
    sd.theme = { latinFont: 'Inter', cjkFont: 'Noto Sans TC', title: 20, subtitle: 14, label: 12, metric: 12 };
    for (const file of [f, sf]) {
      const back = readProjectText(saveProject(loaded(file)).text);
      expect(back.ok && back.file.designs).toEqual(file.designs);
    }
  });

  it('a project with all five design types keeps all of them and the active one', () => {
    const all = golden('function');
    all.designs = TYPES.map(t => golden(t).designs[0]);
    all.activeDesignId = all.designs[3].id;
    const back = readProjectText(saveProject(loaded(all)).text);
    expect(back.ok && back.file.designs.map(d => d.type)).toEqual([...TYPES]);
    expect(back.ok && back.file.activeDesignId).toBe(all.designs[3].id);
  });

  it('saving marks the store saved and gives a safe file name', () => {
    const s = loaded(golden('power'));
    s.rename('Board: rev A?');
    expect(s.dirty).toBe(true);
    expect(saveProject(s).name).toBe('Board rev A.archflow.json');
    expect(s.dirty).toBe(false);
    expect(fileNameFor('  ..  ')).toBe('ArchFlow.archflow.json');
    expect(fileNameFor('a/b\\c<d>|e')).toBe('a b c d e.archflow.json');
    expect(fileNameFor('電源架構')).toBe('電源架構.archflow.json');
    expect(projectText(golden('flowchart')).endsWith('}\n')).toBe(true);
  });
});

describe('open refuses without touching the open project', () => {
  const opened = () => { const s = new Store(); openProjectText(s, goldenText('function')); return s; };

  it('V1 / V2 files → "legacy format not supported"', () => {
    const v2 = fs.readFileSync('tests/golden/function/project.json', 'utf8');
    for (const text of [v2, JSON.stringify({ version: 4, nodes: [] }), JSON.stringify({ nodes: [], edges: [] }), JSON.stringify({ schemaVersion: 2 })]) {
      const s = opened(), before = JSON.stringify(s.toFile());
      const r = openProjectText(s, text);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toBe('legacy-format');
      expect(openMessage(r)).toBe('file.legacyFormat');
      expect(JSON.stringify(s.toFile())).toBe(before);
    }
    expect(t('file.legacyFormat')).toContain('不支援舊版格式');
  });

  it('newer, broken JSON, non-objects, invalid content and > 8 MB', async () => {
    const cases: [string, string][] = [
      [JSON.stringify({ ...golden('function'), schemaVersion: 4 }), 'newer-format'],
      ['{"schemaVersion":3', 'not-json'],
      ['[1,2]', 'invalid'],
      ['null', 'invalid'],
      [JSON.stringify({ ...golden('function'), designs: [] }), 'invalid'],
      ['"' + 'x'.repeat(FILE_LIMITS.bytes) + '"', 'too-large'],
    ];
    for (const [text, reason] of cases) {
      const s = opened(), before = JSON.stringify(s.toFile());
      const r = openProjectText(s, text);
      expect(!r.ok && r.reason, reason).toBe(reason);
      expect(JSON.stringify(s.toFile())).toBe(before);
    }
    const big = await readProjectBlob(new Blob(['x'.repeat(FILE_LIMITS.bytes + 1)]));
    expect(!big.ok && big.reason).toBe('too-large');
    const ok = await readProjectBlob(new Blob([goldenText('schedule')]));
    expect(ok.ok).toBe(true);
    const bad = readProjectText(JSON.stringify({ ...golden('function'), designs: [] }));
    expect(!bad.ok && t(openMessage(bad), { count: bad.errors.length })).toMatch(/1/);
  });
});

describe('io/migrate', () => {
  it('current files pass through unchanged; older than V3 is legacy; newer is refused', () => {
    const f = golden('function') as unknown as Record<string, unknown>;
    const r = migrate(f);
    expect(r.ok && r.file).toEqual(f);
    expect(r.ok && r.from).toBe(3);
    expect(migrate({ version: 5 })).toEqual({ ok: false, reason: 'legacy', version: 5 });
    expect(migrate({ schemaVersion: 2.5 })).toMatchObject({ ok: false, reason: 'legacy' });
    expect(migrate({ schemaVersion: 9 })).toMatchObject({ ok: false, reason: 'newer' });
  });

  it('runs a chain of steps for a future version, without changing the input', () => {
    const steps = {
      3: (x: any) => ({ ...x, schemaVersion: 4, renamed: x.old, old: undefined }),
      4: (x: any) => ({ ...x, schemaVersion: 5, added: true }),
    };
    const input = { schemaVersion: 3, old: 'v' };
    const r = migrate(input, steps, 5);
    expect(r.ok && r.file).toMatchObject({ schemaVersion: 5, renamed: 'v', added: true });
    expect(r.ok && r.from).toBe(3);
    expect(input).toEqual({ schemaVersion: 3, old: 'v' });
    expect(() => migrate({ schemaVersion: 3 }, { 3: (x: any) => x }, 4)).toThrow(/must produce schemaVersion 4/);
    expect(() => migrate({ schemaVersion: 3 }, {}, 4)).toThrow(/no migration/);
  });
});
