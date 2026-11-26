// The workspace chrome above the canvas (V2 af2-appbar + af2-cmdbar): an app bar with the project,
// the menus (every shell command, grouped) and the always-needed actions, and a command bar that
// shows only the commands of the active design type. Both stay one row: the command bar scrolls
// sideways when it does not fit and drops its group captions on narrow windows (shell.css).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { t, getLocale, setLocale, LOCALES, isLocale, onLocaleChange, type MessageKey } from '../core/i18n';
import { formatShortcut } from '../core/commands';
import { APP_VERSION } from '../version';
import { Icon, type IconName } from './icons';
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

/** A menu entry: a command (with an optional argument, label, icon and checked state) or a separator. */
export type MenuEntry = { id: string; label?: string; arg?: unknown; icon?: IconName; checked?: boolean; key?: string } | 'sep' | { heading: string };

/**
 * A menu button (WAI-ARIA menu button pattern): Enter / Space / ArrowDown open it on the first
 * item, ArrowUp on the last; ArrowUp / ArrowDown / Home / End move between enabled items, Escape
 * closes it and returns focus to the button, Tab or a click outside closes it.
 */
export function MenuButton({ shell, label, entries, className, buttonClass, trigger, tip, align }: {
  shell: Shell; label: string; entries: MenuEntry[]; className?: string; buttonClass?: string; trigger?: ReactNode; tip?: string; align?: 'end';
}) {
  const [open, setOpen] = useState<false | 'first' | 'last'>(false);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const items = entries.filter(e => e === 'sep' || 'heading' in e || shell.registry.has(e.id));
  // no separator at the ends or twice in a row (a group that has no command here)
  const shown = items.filter((e, i) => e !== 'sep' || (i > 0 && i < items.length - 1 && items[i - 1] !== 'sep'));
  const enabledItems = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (!open) return undefined;
    const list = enabledItems();
    (open === 'last' ? list[list.length - 1] : list[0])?.focus();
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  if (!shown.some(e => e !== 'sep' && !('heading' in e))) return null;
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
      <button ref={button} type="button" className={buttonClass ?? 'af-button af-menu-button'} aria-haspopup="menu" aria-expanded={!!open}
        title={tip} aria-label={trigger ? label : undefined}
        onClick={() => setOpen(open ? false : 'first')}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen('first'); } else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen('last'); } }}>
        {trigger ?? <>{label}<Icon name="chevronDown" className="af-icon af-caret" /></>}
      </button>
      {open && (
        <div className={`af-menu-list${align === 'end' ? ' is-end' : ''}`} role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {shown.map((e, i) => {
            if (e === 'sep') return <div key={`sep${i}`} role="separator" className="af-menu-sep" />;
            if ('heading' in e) return <div key={`h${i}`} role="presentation" className="af-menu-head">{e.heading}</div>;
            const cmd = shell.registry.get(e.id)!, sc = shortcutText(shell, e.id);
            return (
              <button key={e.key ?? e.id} type="button" role={e.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={e.checked}
                className="af-menu-item" tabIndex={-1} disabled={!shell.enabled(e.id)}
                aria-keyshortcuts={sc || undefined} onClick={() => { close(true); void shell.run(e.id, e.arg); }}>
                {e.icon && <Icon name={e.icon} />}
                <span className="af-menu-label">{e.label ?? t(cmd.label)}</span>
                {e.checked && <Icon name="check" className="af-icon af-menu-check" />}
                {sc && <kbd className="af-menu-kbd">{sc}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A command bar tool (V2 af2-tool): icon and label, tooltip with the shortcut, disabled with its command. */
export function Tool({ shell, id, icon, label, primary, iconOnly, pressed, arg }: {
  shell: Shell; id: string; icon: IconName; label?: MessageKey; primary?: boolean; iconOnly?: boolean; pressed?: boolean; arg?: unknown;
}) {
  const cmd = shell.registry.get(id);
  if (!cmd) return null;
  const sc = shortcutText(shell, id), text = t(label ?? cmd.label);
  return (
    <button type="button" className={`af-tool${primary ? ' is-primary' : ''}${iconOnly ? ' is-icon' : ''}${pressed !== undefined ? ' is-toggle' : ''}`}
      disabled={!shell.enabled(id)} aria-pressed={pressed} aria-label={iconOnly ? text : undefined} aria-keyshortcuts={sc || undefined}
      data-tip={sc ? `${text} (${sc})` : iconOnly ? text : undefined} onClick={() => void shell.run(id, arg)}>
      <Icon name={icon} />
      {!iconOnly && <span className="lbl">{text}</span>}
    </button>
  );
}

const Sep = () => <span className="af-cmd-sep" aria-hidden="true" />;

/** Library of parts / power blocks (V2 "parts library"): a menu of the design's insert commands, a heading per group. */
function Library({ shell }: { shell: Shell }) {
  const power = shell.view === 'power';
  const groups = power ? POWER_GROUPS : PART_GROUPS;
  const ids = new Set((shell.module?.commands ?? []).map(c => c.id));
  const entries: MenuEntry[] = groups.flatMap(g => {
    const cmds = shell.registry.list(g.id).filter(c => ids.has(c.id));
    return cmds.length ? [{ heading: t(g.label) } as MenuEntry, ...cmds.map(c => ({ id: c.id }))] : [];
  });
  const label = t(power ? 'power.insert' : 'part.insert');
  return (
    <MenuButton shell={shell} label={label} entries={entries} buttonClass="af-tool"
      trigger={<><Icon name="blocks" /><span className="lbl">{t(power ? 'cmdbar.powerLibrary' : 'cmdbar.library')}</span></>} />
  );
}

/** The command bar of the active design (V2 af2-cmdbar): one row of tools; embedded editors bring their own. */
function CommandBar({ shell }: { shell: Shell }) {
  if (shell.module?.embedded) return null;
  const schedule = !shell.isBlockDiagram;
  return (
    <div className="af-cmdbar" role="toolbar" aria-label={t('toolbar.label')}>
      <Tool shell={shell} id="view.toggleExplorer" icon="panelLeft" iconOnly pressed={shell.explorerOpen} />
      <Sep />
      {schedule ? <>
        <Tool shell={shell} id="schedule.append" icon="plus" primary />
        <Tool shell={shell} id="schedule.addBranch" icon="branch" />
        <Tool shell={shell} id="text.add" icon="type" />
      </> : <>
        <Tool shell={shell} id="block.add" icon="plus" primary />
        <Library shell={shell} />
        <Tool shell={shell} id="frame.add" icon="frame" />
        <Tool shell={shell} id="text.add" icon="type" />
      </>}
      <Sep />
      <Tool shell={shell} id="history.undo" icon="undo" iconOnly />
      <Tool shell={shell} id="history.redo" icon="redo" iconOnly />
      <Sep />
      {schedule ? <>
        <Tool shell={shell} id="schedule.autoArrange" icon="alignBars" />
        <Tool shell={shell} id="schedule.fixConflicts" icon="magnet" />
      </> : <>
        <Tool shell={shell} id="layout.arrangePreview" icon="wand" />
        <Tool shell={shell} id="wire.reroute" icon="route" />
        <Sep />
        <Tool shell={shell} id="design.manage" icon="grid" />
      </>}
      <span className="af-spacer" />
      {!schedule && <Tool shell={shell} id="theme.fonts" icon="sliders" />}
      <Tool shell={shell} id="design.loadExample" icon="layoutTemplate" />
      <Sep />
      <Tool shell={shell} id="view.fit" icon="fit" />
      <Tool shell={shell} id="view.toggleInspector" icon="panelRight" iconOnly pressed={shell.inspectorOpen} />
    </div>
  );
}

/** Interface language as a two-part switch (V2 af2-lang), no reload. */
export function LangSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  return (
    <div className={`af-seg af-lang${className ? ' ' + className : ''}`} role="radiogroup" aria-label={t('locale.switch')}>
      {LOCALES.map(l => (
        <button key={l} type="button" role="radio" aria-checked={locale === l} title={t(`locale.${l}` as MessageKey)} onClick={() => setLocale(l)}>
          {t(`locale.short.${l}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

/** The ArchFlow mark (V2 af2-logo). */
export function Logo() {
  return (
    <svg className="af-logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" className="af-logo-bg" />
      <rect x="8" y="12" width="20" height="16" rx="3" className="af-logo-a" />
      <rect x="36" y="36" width="20" height="16" rx="3" className="af-logo-b" />
      <path d="M28 20H44V31" fill="none" className="af-logo-line" strokeWidth="4" strokeLinejoin="round" />
      <path d="M38.5 29.5L44 36L49.5 29.5Z" className="af-logo-b" />
      <circle cx="28" cy="20" r="3" className="af-logo-dot" />
    </svg>
  );
}

const KIND_ICON: Record<string, IconName> = { function: 'blocks', schedule: 'schedule', sequence: 'activity', flowchart: 'flow' };

/** The project name, edited in place (V2 af2-project-name). */
function ProjectName({ shell }: { shell: Shell }) {
  const name = shell.store.projectName;
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const commit = () => { const v = value.trim().slice(0, 100); if (v && v !== name) shell.store.rename(v); else setValue(name); };
  return (
    <input className="af-project-name" aria-label={t('start.projectName')} value={value} maxLength={100} size={Math.max(5, value.length + 1)}
      onChange={e => setValue(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } else if (e.key === 'Escape') { setValue(name); (e.target as HTMLInputElement).blur(); } }} />
  );
}

/** The design switcher (V2 af2-design-trigger): the designs, then the design commands. */
function DesignMenu({ shell }: { shell: Shell }) {
  const s = shell.store, d = s.activeDesign;
  if (!d) return null;
  const entries: MenuEntry[] = [
    { heading: t('design.list') },
    ...s.designs.map(x => ({ id: 'design.switch', arg: x.id, key: `switch:${x.id}`, label: x.name, icon: KIND_ICON[x.type], checked: x.id === d.id })),
    'sep', { id: 'design.add', icon: 'plus' }, { id: 'design.loadExample', icon: 'layoutTemplate' }, { id: 'design.duplicate' },
    'sep', { id: 'design.rename', icon: 'pencil' }, { id: 'design.delete', icon: 'trash' },
  ];
  return (
    <MenuButton shell={shell} label={t('design.switchOrManage')} entries={entries} buttonClass="af-design-trigger" tip={t('design.switchOrManage')}
      trigger={<>
        <span className="af-kind-dot" data-kind={d.type}><Icon name={KIND_ICON[d.type] ?? 'blocks'} /></span>
        <span className="af-design-name">{d.name}</span>
        {s.designs.length > 1 && <span className="af-count">{s.designs.length}</span>}
        <Icon name="chevronDown" className="af-icon af-caret" />
      </>} />
  );
}

/** App bar (V2.10.1 af2-appbar, light chrome) and command bar. */
export function AppBar({ shell }: { shell: Shell }) {
  const s = shell.store, sc = shortcutText(shell, 'palette.open');
  return (
    <>
      <header className="af-appbar">
        <div className="af-brand">
          <Logo />
          <span className="af-wordmark">{t('app.name')}</span>
          <span className="af-ver">V{APP_VERSION}</span>
        </div>
        <div className="af-crumbs">
          <ProjectName shell={shell} />
          <span className="af-slash" aria-hidden="true">/</span>
          <DesignMenu shell={shell} />
        </div>
        <span className="af-spacer" />
        <button type="button" className="af-search" onClick={() => void shell.run('palette.open')} aria-keyshortcuts={sc || undefined}>
          <Icon name="search" />
          <span className="af-search-text">{t('palette.searchHint')}</span>
          <span className="af-search-keys" aria-hidden="true">{sc.split('+').map(k => <kbd key={k} className="af-kbd">{k}</kbd>)}</span>
        </button>
        <span className="af-spacer" />
        <button type="button" className="af-save-state" data-state={s.dirty ? 'dirty' : 'saved'} onClick={() => void shell.run('project.save')}
          title={t('cmd.projectSave')}>
          <span className="af-led" aria-hidden="true" />
          <span>{t(s.dirty ? 'status.unsavedChanges' : 'status.saved')}</span>
        </button>
        <LangSwitch />
        <div className="af-actions">
          <ActionButton shell={shell} id="project.new" icon="filePlus" label="appbar.new" />
          <ActionButton shell={shell} id="project.open" icon="folderOpen" label="appbar.open" />
          <ActionButton shell={shell} id="export.open" icon="download" label="appbar.export" />
          <ActionButton shell={shell} id="project.save" icon="save" label="appbar.save" primary />
          <ActionButton shell={shell} id="help.open" icon="help" iconOnly />
        </div>
      </header>
      <CommandBar shell={shell} />
    </>
  );
}

/** A button of the app bar (V2 af2-btn: ghost / primary / icon). */
function ActionButton({ shell, id, icon, label, primary, iconOnly }: { shell: Shell; id: string; icon: IconName; label?: MessageKey; primary?: boolean; iconOnly?: boolean }) {
  const cmd = shell.registry.get(id)!, sc = shortcutText(shell, id), long = t(cmd.label);
  return (
    <button type="button" className={`af-btn${primary ? ' primary' : iconOnly ? ' icon' : ' ghost'}`} disabled={!shell.enabled(id)}
      title={sc ? `${long} (${sc})` : long} aria-label={iconOnly ? long : undefined} aria-keyshortcuts={sc || undefined} onClick={() => void shell.run(id)}>
      <Icon name={icon} />
      {!iconOnly && label && <span>{t(label)}</span>}
    </button>
  );
}
