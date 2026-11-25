// Interface text. One copy of the code; all wording lives in i18n/<locale>.json with flat
// keys ("area.item"). Switching language re-renders in place — no page reload (unlike V2,
// which reloaded a second copy of the whole app; audit §3).
import zhHant from '../../i18n/zh-Hant.json';
import en from '../../i18n/en.json';

export const LOCALES = ['zh-Hant', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof zhHant;
export type Vars = Record<string, string | number>;

const catalogs: Record<Locale, Record<MessageKey, string>> = { 'zh-Hant': zhHant, en };
const STORAGE_KEY = 'archflow:locale';
const DEFAULT_LOCALE: Locale = 'zh-Hant';

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<(locale: Locale) => void>();

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Text for `key` in the current locale; `{name}` placeholders are filled from `vars`. */
export function t(key: MessageKey, vars?: Vars): string {
  const text = catalogs[current][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

export const getLocale = (): Locale => current;

/** Change the interface language; listeners re-render. Remembered in localStorage when available. */
export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* storage may be unavailable */ }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const fn of listeners) fn(locale);
}

/** Subscribe to language changes; returns an unsubscribe function. */
export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pick the starting language: remembered choice, else the browser language, else zh-Hant. */
export function initLocale(navigatorLanguages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : []): Locale {
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  const fromBrowser = navigatorLanguages.some(l => /^zh/i.test(l)) ? 'zh-Hant' : navigatorLanguages.some(l => /^en/i.test(l)) ? 'en' : null;
  current = isLocale(saved) ? saved : fromBrowser ?? DEFAULT_LOCALE;
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}
