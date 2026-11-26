// module: shell, designs:sequence, designs:flowchart, tools:bom — the embedded Source Han Sans TC (V2 AF_FONT_CSS) in the
// app document and in the frames V2 gave it to (sequence, flowchart, BOM); not in the three tool pages.
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { FONT_CSS, installFonts } from '../../src/styles/fonts';
import { sequenceSrcdoc } from '../../src/designs/sequence';
import { flowchartSrcdoc } from '../../src/designs/flowchart';
import { bomTool } from '../../src/tools/bom';
import { edidTool } from '../../src/tools/edid';

describe('embedded font (3.46d5)', () => {
  it('has the regular and bold faces as woff2 data, no network', () => {
    expect(FONT_CSS.match(/@font-face\{font-family:"Source Han Sans TC"/g)).toHaveLength(2);
    expect(FONT_CSS).toContain('font-weight:100 549');
    expect(FONT_CSS).toContain('font-weight:550 900');
    expect(FONT_CSS).not.toMatch(/url\((?!data:)/);
  });
  it('goes into the app once and into the sequence, flowchart and BOM frames first, as V2', () => {
    installFonts(document); installFonts(document);
    expect(document.querySelectorAll('style#af-fonts')).toHaveLength(1);
    for (const doc of [sequenceSrcdoc('zh-Hant'), flowchartSrcdoc('en'), bomTool.srcdoc('zh-Hant')]) {
      expect(doc.indexOf(FONT_CSS)).toBeGreaterThan(0);
      expect(doc.indexOf(FONT_CSS)).toBeLessThan(doc.indexOf('</head>'));
    }
    expect(edidTool.srcdoc('zh-Hant')).not.toContain(FONT_CSS);
  });
});
