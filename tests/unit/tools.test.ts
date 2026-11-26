// module: tools:bom, tools:edid, tools:hex, tools:pattern, shell — step 3.32: the tool registry, the BOM tool's frame document and host
// object, and opening / closing tools in the shell (frames stay mounted after closing, as V2).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ToolRegistry } from '../../src/tools/module';
import { bomTool } from '../../src/tools/bom';
import { edidTool } from '../../src/tools/edid';
import { hexTool } from '../../src/tools/hex';
import { patternTool } from '../../src/tools/pattern';
import { installToolHosts } from '../../src/shell/embedded';
import { Shell } from '../../src/shell/controller';
import { createRegistry, createTools } from '../../src/app';

const ROOT = path.resolve(__dirname, '../..');

describe('tools', () => {
  it('registry: unique ids', () => {
    const r = new ToolRegistry();
    r.register(bomTool);
    expect(() => r.register(bomTool)).toThrow();
    expect(createTools().list().map(x => x.id)).toContain('bom');
  });

  it('BOM: the frame document is the vendor page (style + bundle) in the interface language', () => {
    const doc = bomTool.srcdoc('en');
    expect(doc.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(doc).toContain(fs.readFileSync(path.join(ROOT, 'vendor/rsi-bom/style.css'), 'utf8'));
    expect(doc).toContain(fs.readFileSync(path.join(ROOT, 'vendor/rsi-bom/bundle.js'), 'utf8'));
  });

  it('EDID: the frame document is the vendor page as is (V2 srcdoc); host afEdidHost', () => {
    expect(edidTool.srcdoc('zh-Hant')).toBe(fs.readFileSync(path.join(ROOT, 'vendor/tools/edid.html'), 'utf8'));
    expect(edidTool.host).toBe('afEdidHost');
    expect(createTools().list().map(x => x.id).slice(0, 2)).toEqual(['bom', 'edid']);
  });

  it('Hex: the vendor page as is; host afHexHost', () => {
    expect(hexTool.srcdoc('en')).toBe(fs.readFileSync(path.join(ROOT, 'vendor/tools/hex.html'), 'utf8'));
    expect(hexTool.host).toBe('afHexHost');
    expect(createTools().get('hex')).toBe(hexTool);
  });

  it('Pattern: the vendor page as is; host afPgHost; full screen and clipboard allowed as in V2', () => {
    expect(patternTool.srcdoc('zh-Hant')).toBe(fs.readFileSync(path.join(ROOT, 'vendor/tools/pattern.html'), 'utf8'));
    expect([patternTool.host, patternTool.allowFullscreen]).toEqual(['afPgHost', true]);
    expect(patternTool.allow).toContain('fullscreen *');
    expect(createTools().list().map(x => x.id)).toEqual(['bom', 'edid', 'hex', 'pattern']);
  });

  it('shell: open from the command, close through the host object; opened frames are remembered', async () => {
    const s = new Shell(createRegistry(), createTools());
    const win = {} as Record<string, { close(): void; toast(t: string): void; lang: string }>;
    installToolHosts(s, win as unknown as Window);
    expect(s.enabled('tool.open.bom')).toBe(true);
    await s.run('tool.open.bom');
    expect([s.tool, s.openedTools]).toEqual(['bom', ['bom']]);
    win.afRsiHost.toast('done');
    expect(s.message).toMatchObject({ key: 'embedded.status', vars: { text: 'done' } });
    win.afRsiHost.close();
    expect([s.tool, s.openedTools]).toEqual([null, ['bom']]);
  });
});
