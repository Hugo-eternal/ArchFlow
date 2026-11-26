// The V3 shell: start screen, or the workspace (app bar, design list, canvas, properties panel,
// status bar) with its dialogs. All actions are registry commands (controller.ts).
import { useEffect, useRef, useState } from 'react';
import { t, getLocale, setLocale, LOCALES, isLocale, onLocaleChange, type MessageKey } from '../core/i18n';
import { formatShortcut } from '../core/commands';
import { APP_VERSION } from '../version';
import { isMac, type Shell, type DesignChoice } from './controller';
import { useVersion } from './use-store';
import { Canvas } from './Canvas';
import { InspectorPane } from './InspectorPane';
import { ConfirmDialog, ExportDialog, NewDesignDialog, PromptDialog, DesignChooser, defaultChoice } from './Dialogs';

function useLocale(): string {
  const [l, setL] = useState(getLocale());
  useEffect(() => onLocaleChange(setL), []);
  return l;
}

function LocaleSelect() {
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

/** A button that runs a command; shows its shortcut in the tooltip and is disabled with it. */
function CommandButton({ shell, id, label, className, primary }: { shell: Shell; id: string; label?: MessageKey; className?: string; primary?: boolean }) {
  const cmd = shell.registry.get(id)!;
  const sc = cmd.shortcut === undefined ? '' : formatShortcut(typeof cmd.shortcut === 'string' ? cmd.shortcut : cmd.shortcut[0], isMac());
  const text = t(label ?? cmd.label);
  return (
    <button type="button" className={`af-button${primary ? ' is-primary' : ''}${className ? ' ' + className : ''}`} disabled={!shell.enabled(id)}
      title={sc ? `${text} (${sc})` : text} aria-keyshortcuts={sc || undefined} onClick={() => void shell.run(id)}>
      {text}
    </button>
  );
}

function FileInput({ shell }: { shell: Shell }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { shell.pickFile = () => ref.current?.click(); }, [shell]);
  return (
    <input ref={ref} type="file" accept=".json,application/json" className="af-visually-hidden" tabIndex={-1} aria-hidden="true"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void shell.openBlob(f); }} />
  );
}

function StartScreen({ shell }: { shell: Shell }) {
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<DesignChoice>(() => defaultChoice(shell));
  return (
    <main className="af-start">
      <div className="af-start-card">
        <div className="af-start-head">
          <h1>{t('app.name')}</h1>
          <LocaleSelect />
        </div>
        <p className="af-start-tagline">{t('app.tagline')}</p>
        <form onSubmit={e => { e.preventDefault(); shell.newProject(name, choice); }}>
          <label className="af-form-field">
            <span>{t('start.projectName')}</span>
            <input value={name} maxLength={100} placeholder={t('project.untitled')} onChange={e => setName(e.target.value)} />
          </label>
          <DesignChooser shell={shell} value={choice} onChange={setChoice} legend="start.designType" />
          <p className="af-start-note">{t('start.moreTypesLater')}</p>
          <div className="af-start-actions">
            <button type="submit" className="af-button is-primary">{t('start.create')}</button>
            <button type="button" className="af-button" onClick={() => shell.pickFile()}>{t('start.open')}</button>
          </div>
        </form>
        <Status shell={shell} />
        <p className="af-start-version">{t('app.version', { version: APP_VERSION })}</p>
      </div>
    </main>
  );
}

function Status({ shell }: { shell: Shell }) {
  const m = shell.message;
  return (
    <p className={`af-status-message${m?.tone === 'error' ? ' is-error' : ''}`} role={m?.tone === 'error' ? 'alert' : 'status'}>
      {m ? t(m.key, m.vars) : ''}
    </p>
  );
}

/** Design commands of some groups (e.g. the parts library) as one picker, a section per group. */
function CommandPicker({ shell, groups, label }: { shell: Shell; groups: { id: string; label: MessageKey }[]; label: MessageKey }) {
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

const PART_GROUPS: { id: string; label: MessageKey }[] = [
  { id: 'parts', label: 'part.group.parts' }, { id: 'connectors', label: 'part.group.connectors' }, { id: 'templates', label: 'part.group.templates' },
];

/** Function / power view of a block diagram: a two-part switch above the canvas (plan §2.2.1). */
function ViewSwitch({ shell }: { shell: Shell }) {
  if (!shell.isBlockDiagram) return null;
  const view = shell.view;
  const sc = formatShortcut('Shift+V', isMac());
  return (
    <div className="af-view-switch" role="group" aria-label={t('view.mode.label')}>
      {(['function', 'power'] as const).map(v => {
        const label = t(`view.mode.${v}`);
        return (
          <button key={v} type="button" className={`af-view-option${view === v ? ' is-active' : ''}`} aria-pressed={view === v}
            title={`${label} — ${t('view.mode.toggle')} (${sc})`} disabled={!shell.enabled(`view.mode.${v}`)}
            onClick={() => void shell.run(`view.mode.${v}`)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DesignList({ shell }: { shell: Shell }) {
  const s = shell.store;
  return (
    <nav className="af-designs" aria-label={t('design.list')}>
      <ul>
        {s.designs.map(d => (
          <li key={d.id}>
            <button type="button" className={`af-design-item${d.id === s.activeDesignId ? ' is-active' : ''}`} aria-current={d.id === s.activeDesignId ? 'page' : undefined}
              onClick={() => void shell.run('design.switch', d.id)}>
              <span className="af-design-name">{d.name}</span>
              <span className="af-design-type">{t(`design.type.${d.type}` as MessageKey)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="af-designs-actions">
        <CommandButton shell={shell} id="design.add" />
        <CommandButton shell={shell} id="design.rename" />
        <CommandButton shell={shell} id="design.delete" />
      </div>
    </nav>
  );
}

function Workspace({ shell }: { shell: Shell }) {
  const s = shell.store;
  const d = s.activeDesign;
  const invalid = shell.isBlockDiagram ? [...shell.routesFor(shell.data()).values()].filter(r => !r.valid).length : 0;
  return (
    <div className="af-shell">
      <header className="af-appbar">
        <div className="af-appbar-title">
          <span className="af-brand">{t('app.name')}</span>
          <span className="af-project-name">{s.projectName}{s.dirty ? ' •' : ''}</span>
          {s.dirty && <span className="af-visually-hidden">{t('project.unsaved')}</span>}
        </div>
        <div className="af-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
          <CommandButton shell={shell} id="project.new" />
          <CommandButton shell={shell} id="project.open" />
          <CommandButton shell={shell} id="project.save" />
          <span className="af-toolbar-sep" aria-hidden="true" />
          <CommandButton shell={shell} id="history.undo" />
          <CommandButton shell={shell} id="history.redo" />
          <span className="af-toolbar-sep" aria-hidden="true" />
          <CommandButton shell={shell} id="block.add" />
          <CommandButton shell={shell} id="port.add" />
          <CommandButton shell={shell} id="text.add" />
          <CommandButton shell={shell} id="frame.add" />
          <CommandPicker shell={shell} groups={PART_GROUPS} label="part.insert" />
          <CommandButton shell={shell} id="selection.delete" />
          <span className="af-toolbar-sep" aria-hidden="true" />
          <CommandButton shell={shell} id="view.fit" />
          <CommandButton shell={shell} id="view.toggleInspector" />
          <CommandButton shell={shell} id="export.open" primary />
        </div>
        <LocaleSelect />
      </header>
      <div className="af-body">
        <DesignList shell={shell} />
        <section className="af-stage" aria-label={d?.name}>
          <ViewSwitch shell={shell} />
          <Canvas key={d?.id} shell={shell} />
        </section>
        <InspectorPane shell={shell} />
      </div>
      <footer className="af-statusbar">
        <Status shell={shell} />
        {invalid > 0 && <span className="af-status-warning">{t('status.invalidRoutes', { count: invalid })}</span>}
        <span className="af-status-zoom">{t('status.zoom', { zoom: Math.round(shell.camera.z * 100) })}</span>
      </footer>
    </div>
  );
}

export function App({ shell }: { shell: Shell }) {
  useVersion(shell.store);
  useVersion(shell.ui);
  useLocale();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (shell.dialog || shell.screen !== 'workspace') return;
      if (shell.registry.handleKey(e, shell, isMac())) e.preventDefault();
    };
    const leave = (e: BeforeUnloadEvent) => { if (shell.store.dirty) e.preventDefault(); };
    window.addEventListener('keydown', key);
    window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', leave); };
  }, [shell]);

  const dlg = shell.dialog;
  return (
    <>
      <FileInput shell={shell} />
      {shell.screen === 'start' ? <StartScreen shell={shell} /> : <Workspace shell={shell} />}
      {dlg?.kind === 'prompt' && <PromptDialog key="prompt" shell={shell} d={dlg} />}
      {dlg?.kind === 'confirm' && <ConfirmDialog key="confirm" shell={shell} d={dlg} />}
      {dlg?.kind === 'export' && <ExportDialog shell={shell} />}
      {dlg?.kind === 'newDesign' && <NewDesignDialog shell={shell} />}
    </>
  );
}
