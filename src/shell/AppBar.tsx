// The workspace chrome above the canvas (V2 af2-appbar + af2-cmdbar): an app bar with the project,
// the menus (every shell command, grouped) and the always-needed actions, and a command bar that
// shows only the commands of the active design type. Both stay one row: the command bar scrolls
// sideways when it does not fit and drops its group captions on narrow windows (shell.css).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { t, getLocale, setLocale, LOCALES, isLocale, onLocaleChange, type MessageKey } from '../core/i18n';
import { formatShortcut } from '../core/commands';
import { isMac, type Shell } from './controller';

export function useLocale(): string {
  const [l, setL] = useState(getLocale());
  useEffect(() => onLocaleChange(setL), []);
  return l;
}

export function LocaleSelect() {
  const locale = useLocale();
  return (
    <label className="af-locale">
      <span className="af-visually-hidden">{t('locale.switch')}</span>
      <select value={locale} onChange={e => { if (isLocale(e.target.value)) setLocale(e.target.value); }}>
        {LOCALES.map(l => <option key={l} value={l}>{t(`locale.${l}` as MessageKey)}</option>)}
      </select>
    </label>
  );
}

/** The shortcut of a command as shown to the user ('' when it has none). */
export function shortcutText(shell: Shell, id: string): string {
  const cmd = shell.registry.get(id);
  if (!cmd || cmd.shortcut === undefined) return '';
  return formatShortcut(typeof cmd.shortcut === 'string' ? cmd.shortcut : cmd.shortcut[0], isMac());
}

/** A button that runs a command; shows its shortcut in the tooltip and is disabled with it. */
export function CommandButton({ shell, id, label, className, primary }: { shell: Shell; id: string; label?: MessageKey; className?: string; primary?: boolean }) {
  const cmd = shell.registry.get(id)!;
  const sc = shortcutText(shell, id);
  const text = t(label ?? cmd.label);
  return (
    <button type="button" className={`af-button${primary ? ' is-primary' : ''}${className ? ' ' + className : ''}`} disabled={!shell.enabled(id)}
      title={sc ? `${text} (${sc})` : text} aria-keyshortcuts={sc || undefined} onClick={() => void shell.run(id)}>
      {text}
    </button>
  );
}

/** Design commands of some groups (e.g. the parts library) as one picker, a section per group. */
export function CommandPicker({ shell, groups, label }: { shell: Shell; groups: { id: string; label: MessageKey }[]; label: MessageKey }) {
  const ids = new Set((shell.module?.commands ?? []).map(c => c.id));
  const sections = groups.map(g => ({ ...g, cmds: shell.registry.list(g.id).filter(c => ids.has(c.id)) })).filter(g => g.cmds.length);
  if (!sections.length) return null;
  const all = sections.flatMap(g => g.cmds);
  return (
    <label className="af-picker">
      <span className="af-visually-hidden">{t(label)}</span>
      <select value="" disabled={!all.some(c => shell.enabled(c.id))} onChange={e => { const id = e.target.value; e.target.value = ''; if (id) void shell.run(id); }}>
        <option value="">{t(label)}</option>
        {sections.map(g => (
          <optgroup key={g.id} label={t(g.label)}>
            {g.cmds.map(c => <option key={c.id} value={c.id} disabled={!shell.enabled(c.id)}>{t(c.label)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** Power view insert menu (3.29b e): preset blocks per power role. */
const POWER_GROUPS: { id: string; label: MessageKey }[] = [{ id: 'power-blocks', label: 'power.insert.group' }];

const PART_GROUPS: { id: string; label: MessageKey }[] = [
  { id: 'parts', label: 'part.group.parts' }, { id: 'connectors', label: 'part.group.connectors' }, { id: 'templates', label: 'part.group.templates' },
];

/** A menu entry: a command (with an optional argument / label) or a separator. */
export type MenuEntry = { id: string; label?: string } | 'sep';

/**
 * A menu button (WAI-ARIA menu button pattern): Enter / Space / ArrowDown open it on the first
 * item, ArrowUp on the last; ArrowUp / ArrowDown / Home / End move between enabled items, Escape
 * closes it and returns focus to the button, Tab or a click outside closes it.
 */
export function MenuButton({ shell, label, entries, className }: { shell: Shell; label: string; entries: MenuEntry[]; className?: string }) {
  const [open, setOpen] = useState<false | 'first' | 'last'>(false);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const items = entries.filter(e => e === 'sep' || shell.registry.has(e.id));
  // no separator at the ends or twice in a row (a group that has no command here)
  const shown = items.filter((e, i) => e !== 'sep' || (i > 0 && i < items.length - 1 && items[i - 1] !== 'sep'));
  const enabledItems = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (!open) return undefined;
    const list = enabledItems();
    (open === 'last' ? list[list.length - 1] : list[0])?.focus();
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  if (!shown.some(e => e !== 'sep')) return null;
  const close = (focus: boolean) => { setOpen(false); if (focus) button.current?.focus(); };
  const onMenuKey = (e: ReactKeyboardEvent) => {
    const list = enabledItems(), i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className={`af-menu${className ? ' ' + className : ''}`} ref={root}>
      <button ref={button} type="button" className="af-button af-menu-button" aria-haspopup="menu" aria-expanded={!!open}
        onClick={() => setOpen(open ? false : 'first')}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen('first'); } else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen('last'); } }}>
        {label}
        <span className="af-menu-caret" aria-hidden="true">{'\u25BE'}</span>
      </button>
      {open && (
        <div className="af-menu-list" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {shown.map((e, i) => {
            if (e === 'sep') return <div key={`sep${i}`} role="separator" className="af-menu-sep" />;
            const cmd = shell.registry.get(e.id)!, sc = shortcutText(shell, e.id);
            return (
              <button key={e.id} type="button" role="menuitem" className="af-menu-item" tabIndex={-1} disabled={!shell.enabled(e.id)}
                aria-keyshortcuts={sc || undefined} onClick={() => { close(true); void shell.run(e.id); }}>
                <span>{e.label ?? t(cmd.label)}</span>
                {sc && <kbd className="af-menu-kbd">{sc}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The menus of the app bar: every shell command a user can run, grouped as in a desktop app. */
function menus(shell: Shell): { key: MessageKey; entries: MenuEntry[] }[] {
  const tools: MenuEntry[] = shell.tools.list().map(tl => ({ id: `tool.open.${tl.id}`, label: t(tl.label) }));
  return [
    { key: 'menu.file', entries: [{ id: 'project.new' }, { id: 'project.open' }, { id: 'project.save' }, 'sep', { id: 'project.rename' }, 'sep', { id: 'export.open' }] },
    {
      key: 'menu.edit',
      entries: [{ id: 'history.undo' }, { id: 'history.redo' }, 'sep', { id: 'selection.selectAll' }, { id: 'selection.clear' }, { id: 'selection.delete' },
        ...(shell.isBlockDiagram ? ['sep' as const, { id: 'wire.reroute' }, { id: 'wire.clearRoutes' }] : [])],
    },
    { key: 'menu.design', entries: [{ id: 'design.add' }, { id: 'design.loadExample' }, { id: 'design.duplicate' }, 'sep', { id: 'design.rename' }, { id: 'design.delete' }] },
    {
      key: 'menu.view',
      entries: [
        ...(shell.isBlockDiagram ? [{ id: 'view.mode.function' }, { id: 'view.mode.power' }, 'sep' as const] : []),
        ...(shell.module?.embedded ? [] : [{ id: 'view.fit' }, { id: 'view.zoomIn' }, { id: 'view.zoomOut' }, 'sep' as const, { id: 'view.toggleInspector' }]),
        'sep', { id: 'palette.open' }, { id: 'help.open' },
      ],
    },
    { key: 'tools.menu', entries: tools },
  ];
}

/** A labelled group of the command bar; its caption is hidden on narrow windows (the buttons say enough). */
function Group({ label, children }: { label: MessageKey; children: ReactNode }) {
  return (
    <div className="af-cmd-group" role="group" aria-label={t(label)}>
      <span className="af-cmd-caption" aria-hidden="true">{t(label)}</span>
      {children}
    </div>
  );
}

/** The commands of the active design type (V2 af2-cmdbar), in one row. */
function CommandBar({ shell }: { shell: Shell }) {
  const own = (shell.module?.commands ?? []).filter(c => c.group === 'schedule');
  return (
    <div className="af-cmdbar" role="toolbar" aria-label={t('toolbar.label')}>
      <Group label="cmdbar.history">
        <CommandButton shell={shell} id="history.undo" />
        <CommandButton shell={shell} id="history.redo" />
      </Group>
      {shell.isBlockDiagram && <>
        <Group label="cmdbar.insert">
          <CommandButton shell={shell} id="block.add" />
          <CommandButton shell={shell} id="port.add" />
          <CommandButton shell={shell} id="text.add" />
          <CommandButton shell={shell} id="frame.add" />
          {shell.view === 'power'
            ? <CommandPicker shell={shell} groups={POWER_GROUPS} label="power.insert" />
            : <CommandPicker shell={shell} groups={PART_GROUPS} label="part.insert" />}
        </Group>
        <Group label="cmdbar.arrange">
          <CommandButton shell={shell} id="wire.reroute" />
          <CommandButton shell={shell} id="layout.arrangePreview" />
          <CommandButton shell={shell} id="selection.delete" />
        </Group>
      </>}
      {own.length > 0 && (
        <Group label="cmdbar.schedule">
          {own.map(c => <CommandButton key={c.id} shell={shell} id={c.id} />)}
        </Group>
      )}
      {!shell.module?.embedded && (
        <Group label="cmdbar.view">
          <CommandButton shell={shell} id="view.fit" />
          <CommandButton shell={shell} id="view.toggleInspector" />
        </Group>
      )}
    </div>
  );
}

/** App bar (project, menus, save / export, language) and command bar. */
export function AppBar({ shell }: { shell: Shell }) {
  const s = shell.store, d = s.activeDesign;
  return (
    <>
      <header className="af-appbar">
        <span className="af-brand">{t('app.name')}</span>
        <div className="af-crumbs">
          <button type="button" className="af-project-name" title={t('cmd.projectRename')} onClick={() => void shell.run('project.rename')}>
            {s.projectName}
          </button>
          {s.dirty && <span className="af-unsaved" title={t('project.unsaved')}><span aria-hidden="true">•</span><span className="af-visually-hidden">{t('project.unsaved')}</span></span>}
          {d && <><span className="af-crumb-sep" aria-hidden="true">/</span><span className="af-crumb-design">{d.name}</span></>}
        </div>
        <nav className="af-menubar" aria-label={t('menu.label')}>
          {menus(shell).map(m => <MenuButton key={m.key} shell={shell} label={t(m.key)} entries={m.entries} />)}
        </nav>
        <div className="af-appbar-actions">
          <button type="button" className="af-button af-search" disabled={!shell.enabled('palette.open')} onClick={() => void shell.run('palette.open')}
            aria-keyshortcuts={shortcutText(shell, 'palette.open') || undefined} title={`${t('cmd.palette')} (${shortcutText(shell, 'palette.open')})`}>
            <span>{t('palette.open')}</span>
            <kbd className="af-menu-kbd" aria-hidden="true">{shortcutText(shell, 'palette.open')}</kbd>
          </button>
          <CommandButton shell={shell} id="project.save" />
          <CommandButton shell={shell} id="export.open" primary />
          <LocaleSelect />
        </div>
      </header>
      <CommandBar shell={shell} />
    </>
  );
}
