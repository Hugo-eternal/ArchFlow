// tools/bom — RSI BOM Converter: a BOM Excel file to the RSI format. The page is the V2 vendor
// bundle (vendor/rsi-bom: React + JSZip, no source), mounted like V2 did (legacy L10374 Z4):
// style + root + bundle; it talks to the shell through window.parent.afRsiHost.
import type { ToolModule } from '../module';
import bundle from '../../../vendor/rsi-bom/bundle.js?raw';
import style from '../../../vendor/rsi-bom/style.css?raw';

export const bomTool: ToolModule = {
  id: 'bom',
  label: 'tool.bom.name', description: 'tool.bom.desc', long: 'tool.bom.long',
  srcdoc: lang => `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-Hant'}"><head><meta charset="utf-8"><style>${style}</style></head>`
    + `<body><div id="root"></div><script>${bundle}<\/script></body></html>`,
  host: 'afRsiHost',
  allow: 'clipboard-read; clipboard-write',
};
