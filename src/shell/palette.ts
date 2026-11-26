// The command palette's entries (V2 af2-palette `lg()`): recently used commands, every enabled
// command, the other designs of the project, and the blocks / tasks of the active design
// (DesignModule.findItems). Matching is case-insensitive: every word of the query must occur in
// the label, hint, command id or keywords. No React here, so it is unit-tested directly.
import { t, type MessageKey } from '../core/i18n';
import type { Shell } from './controller';
import { shortcutLabel } from './shortcuts';

export type PaletteSection = 'recent' | 'cmd' | 'design' | 'item';
export interface PaletteItem {
  key: string;
  section: PaletteSection;
  label: string;
  hint: string;
  /** Extra words to match (command id, design type …). */
  kw: string;
  run(): void;
}

export const SECTION_LABEL: Record<PaletteSection, MessageKey> = {
  recent: 'palette.section.recent', cmd: 'palette.section.commands', design: 'palette.section.designs', item: 'palette.section.items',
};

/** Commands that need an argument or make no sense from the palette. */
const HIDDEN = new Set(['palette.open', 'design.switch', 'project.create']);
const hidden = (id: string) => HIDDEN.has(id) || id.startsWith('selection.nudge');

export const RECENT_MAX = 5;

export function paletteItems(shell: Shell): PaletteItem[] {
  const out: PaletteItem[] = [];
  const cmd = (id: string, section: PaletteSection): PaletteItem | null => {
    const c = shell.registry.get(id);
    if (!c || hidden(id) || !shell.enabled(id)) return null;
    return {
      key: `${section}:${id}`, section, label: t(c.label), hint: shortcutLabel(shell, id), kw: id,
      run: () => { shell.rememberCommand(id); void shell.run(id); },
    };
  };
  for (const id of shell.recentCommands) { const it = cmd(id, 'recent'); if (it) out.push(it); }
  for (const c of shell.registry.list()) { const it = cmd(c.id, 'cmd'); if (it) out.push(it); }
  const active = shell.store.activeDesignId;
  for (const d of shell.store.designs) {
    if (d.id === active) continue;
    const type = t(`design.type.${d.type}` as MessageKey);
    out.push({ key: `design:${d.id}`, section: 'design', label: d.name, hint: type, kw: `${type} ${d.type}`, run: () => void shell.run('design.switch', d.id) });
  }
  const m = shell.module;
  if (m?.findItems && active) {
    for (const it of m.findItems(shell.store.data(active) as never)) {
      out.push({ key: `item:${it.id}`, section: 'item', label: it.label, hint: it.hint, kw: '', run: () => shell.reveal(it) });
    }
  }
  return out;
}

/** The entries matching `query`; with an empty query, all of them (recent first, as listed). */
export function filterPalette(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  // a recent command appears once, in the commands section, while searching
  return items.filter(it => it.section !== 'recent' && words.every(w => `${it.label} ${it.hint} ${it.kw}`.toLowerCase().includes(w)));
}
