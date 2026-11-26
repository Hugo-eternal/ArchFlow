// Keyboard shortcuts as shown to the user: in menus, tooltips, the palette and the shortcuts list.
import { formatShortcut } from '../core/commands';
import { t, type MessageKey } from '../core/i18n';
import { isMac, type Shell } from './controller';

/** All shortcuts of a command, formatted for this platform, joined by " / " ('' when none). */
export function shortcutLabel(shell: Shell, id: string, mac = isMac()): string {
  const c = shell.registry.get(id);
  if (!c || c.shortcut === undefined) return '';
  return (typeof c.shortcut === 'string' ? [c.shortcut] : c.shortcut).map(s => formatShortcut(s, mac)).join(' / ');
}

/** Section of the shortcuts list for a command group. */
const GROUP_SECTION: Record<string, MessageKey> = {
  project: 'shortcuts.section.project', design: 'shortcuts.section.project', edit: 'shortcuts.section.edit',
  insert: 'shortcuts.section.insert', 'parts-edit': 'shortcuts.section.insert', view: 'shortcuts.section.view',
  'view-mode': 'shortcuts.section.view', help: 'shortcuts.section.view',
};

export interface ShortcutRow { id: string; label: string; keys: string }
export interface ShortcutSection { title: MessageKey; rows: ShortcutRow[] }

/** Every registered command with a shortcut, grouped (the shortcuts list in the help dialog). */
export function shortcutSections(shell: Shell, mac = isMac()): ShortcutSection[] {
  const order: MessageKey[] = ['shortcuts.section.project', 'shortcuts.section.edit', 'shortcuts.section.insert', 'shortcuts.section.view', 'shortcuts.section.other'];
  const by = new Map<MessageKey, ShortcutRow[]>(order.map(k => [k, []]));
  for (const c of shell.registry.list()) {
    if (c.shortcut === undefined) continue;
    const section = GROUP_SECTION[c.group ?? ''] ?? 'shortcuts.section.other';
    const rows = by.get(section)!, label = t(c.label), keys = shortcutLabel(shell, c.id, mac);
    // commands sharing a label (nudge by 1 grid / by 10) are one row
    const same = rows.find(r => r.label === label);
    if (same) same.keys += ` / ${keys}`; else rows.push({ id: c.id, label, keys });
  }
  return order.map(title => ({ title, rows: by.get(title)! })).filter(s => s.rows.length);
}
