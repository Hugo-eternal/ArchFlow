// module: core — smoke test that the test runner and the packed app are wired up.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('smoke', () => {
  it('index.html embeds both locales and they match src/', () => {
    const line = fs.readFileSync('index.html', 'utf8').split('\n').find(l => l.startsWith('const sources='));
    const sources = JSON.parse(line.slice('const sources='.length).replace(/;\s*$/, ''));
    expect(Object.keys(sources).sort()).toEqual(['en', 'zh-Hant']);
    for (const [locale, b64] of Object.entries(sources)) {
      expect(Buffer.from(b64, 'base64').equals(fs.readFileSync(`legacy/app.${locale}.html`))).toBe(true);
    }
  });
});
