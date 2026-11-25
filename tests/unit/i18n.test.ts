// module: core — V3 i18n (src/core/i18n.ts).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import zh from '../../i18n/zh-Hant.json';
import en from '../../i18n/en.json';

// fresh module state for every test
async function load() {
  vi.resetModules();
  return import('../../src/core/i18n');
}
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
};

describe('i18n', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });

  it('both catalogs have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('defaults to zh-Hant and translates', async () => {
    const i18n = await load();
    expect(i18n.initLocale([])).toBe('zh-Hant');
    expect(i18n.t('app.tagline')).toBe(zh['app.tagline']);
  });

  it('fills placeholders and leaves unknown ones', async () => {
    const { t } = await load();
    expect(t('app.version', { version: '3.0.0' })).toBe('版本 3.0.0');
    expect(t('app.version')).toBe('版本 {version}');
  });

  it('switches language without reload, notifies listeners and remembers the choice', async () => {
    const i18n = await load();
    i18n.initLocale([]);
    const seen: string[] = [];
    const off = i18n.onLocaleChange(l => seen.push(l));
    i18n.setLocale('en');
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.t('app.tagline')).toBe(en['app.tagline']);
    expect(localStorage.getItem('archflow:locale')).toBe('en');
    i18n.setLocale('en'); // no-op
    off();
    i18n.setLocale('zh-Hant');
    expect(seen).toEqual(['en']);
  });

  it('starts from the remembered choice, else the browser language', async () => {
    localStorage.setItem('archflow:locale', 'en');
    expect((await load()).initLocale(['zh-TW'])).toBe('en');
    localStorage.clear();
    expect((await load()).initLocale(['en-US'])).toBe('en');
    expect((await load()).initLocale(['zh-TW', 'en'])).toBe('zh-Hant');
    localStorage.setItem('archflow:locale', 'fr');
    expect((await load()).initLocale(['de'])).toBe('zh-Hant');
  });

  it('ignores unknown locales', async () => {
    const i18n = await load();
    i18n.initLocale([]);
    i18n.setLocale('fr' as never);
    expect(i18n.getLocale()).toBe('zh-Hant');
  });
});
