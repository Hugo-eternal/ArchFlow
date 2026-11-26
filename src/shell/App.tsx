// The V3 shell: start screen, or the workspace (app bar, project contents, canvas, properties panel,
// status bar) with its dialogs. All actions are registry commands (controller.ts).
import { useEffect, useRef, useState } from 'react';
import { t, getLocale, type MessageKey } from '../core/i18n';
import { formatShortcut } from '../core/commands';
import { APP_VERSION } from '../version';
import { isMac, type Shell, type DesignChoice } from './controller';
import type { OutlineItem, OutlineSection } from '../designs/module';
import { useVersion } from './use-store';
import { Canvas } from './Canvas';
import { InspectorPane } from './InspectorPane';
import { ConfirmDialog, ExportDialog, NewDesignDialog, PromptDialog, DesignChooser, defaultChoice } from './Dialogs';
import { OrganizeDialog } from './OrganizeDialog';
import { HelpDialog, PaletteDialog } from './PaletteDialog';
import { AlignGridDialog, FontsDialog } from './LayoutDialogs';
import { AppBar, CommandButton, LocaleSelect, useLocale } from './AppBar';

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
        <form onSubmit={e => { e.preventDefault(); void shell.run('project.create', { name, choice }); }}>
          <label className="af-form-field">
            <span>{t('start.projectName')}</span>
            <input value={name} maxLength={100} placeholder={t('project.untitled')} onChange={e => setName(e.target.value)} />
          </label>
          <DesignChooser shell={shell} value={choice} onChange={setChoice} legend="start.designType" />
          <div className="af-start-actions">
            <button type="submit" className="af-button is-primary">{t('start.create')}</button>
            <button type="button" className="af-button" onClick={() => shell.pickFile()}>{t('start.open')}</button>
            {shell.enabled('project.cancelNew') && <CommandButton shell={shell} id="project.cancelNew" />}
          </div>
        </form>
        <ToolsSection shell={shell} />
        <Status shell={shell} />
        <p className="af-start-version">{t('app.version', { version: APP_VERSION })}</p>
      </div>
    </main>
  );
}

/** The tools as tiles (V2 af2-tools-home on the start screen): usable without a project. */
function ToolsSection({ shell }: { shell: Shell }) {
  const tools = shell.tools.list();
  if (!tools.length) return null;
  return (
    <section className="af-tools-home" aria-labelledby="af-tools-title">
      <h2 id="af-tools-title">{t('tools.title')} <small>{t('tools.subtitle')}</small></h2>
      <div className="af-tool-tiles">
        {tools.map(tl => (
          <button key={tl.id} type="button" className={`af-tool-tile is-${tl.id}`} onClick={() => void shell.run(`tool.open.${tl.id}`)}>
            <strong>{t(tl.label)}</strong>
            <small>{t(tl.long)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The tool dialog over the shell (V2 af2-tool-scrim / af2-tooldlg): one iframe per tool opened
 * so far, only the current one visible; the tool closes itself through its host object, the
 * close button, Escape or a click on the scrim.
 */
function ToolDialog({ shell }: { shell: Shell }) {
  const docs = useRef(new Map<string, string>());
  const frames = useRef(new Map<string, HTMLIFrameElement | null>());
  const before = useRef<HTMLElement | null>(null);
  const open = shell.tool;
  useEffect(() => {
    if (open) {
      before.current = document.activeElement as HTMLElement | null;
      frames.current.get(open)?.focus();
      const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); shell.closeTool(); } };
      window.addEventListener('keydown', key, true);
      return () => window.removeEventListener('keydown', key, true);
    }
    before.current?.focus?.();
    return undefined;
  }, [open, shell]);
  if (!shell.openedTools.length) return null;
  const lang = getLocale() === 'en' ? 'en' : 'zh-Hant';
  const current = open ? shell.tools.get(open) : undefined;
  return (
    <div className="af-tool-scrim" hidden={!open} onPointerDown={e => { if (e.target === e.currentTarget) shell.closeTool(); }}>
      <div className="af-tool-dialog" role="dialog" aria-modal="true" aria-label={current ? t(current.label) : undefined}>
        <div className="af-tool-head">
          <h2>{current ? t(current.label) : ''}</h2>
          <button type="button" className="af-button" onClick={() => shell.closeTool()}>{t('tools.close')}</button>
        </div>
        {shell.openedTools.map(id => {
          const tl = shell.tools.get(id)!;
          // a tool takes its language when it loads: after a language switch it reloads (its unsaved work is lost)
          const doc = `${id}:${lang}`;
          if (!docs.current.has(doc)) docs.current.set(doc, tl.srcdoc(lang));
          return (
            <iframe key={doc} ref={el => { frames.current.set(id, el); }} className="af-tool-frame" title={t(tl.label)} hidden={id !== open}
              srcDoc={docs.current.get(doc)} allow={tl.allow} allowFullScreen={tl.allowFullscreen} />
          );
        })}
      </div>
    </div>
  );
}

/** Notifications over the workspace (V2 af2-toasts): newest last, at most 3; info closes after
 *  3.2 s, errors after 6 s (V2 6 s for toasts with an action); each has a close button. */
function Toasts({ shell }: { shell: Shell }) {
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const x of shell.toasts) if (!timers.current.has(x.id)) timers.current.set(x.id, setTimeout(() => { timers.current.delete(x.id); shell.dismissToast(x.id); }, x.tone === 'error' ? 6000 : 3200));
  });
  useEffect(() => () => { for (const h of timers.current.values()) clearTimeout(h); }, []);
  return (
    <div className="af-toasts" aria-label={t('toast.region')}>
      {shell.toasts.map(x => (
        <div key={x.id} className={`af-toast${x.tone === 'error' ? ' is-error' : ''}`} role={x.tone === 'error' ? 'alert' : 'status'}>
          <span>{t(x.key, x.vars)}</span>
          <button type="button" className="af-toast-close" aria-label={t('toast.dismiss')} onClick={() => shell.dismissToast(x.id)}>{'\u00d7'}</button>
        </div>
      ))}
    </div>
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

/** A design's legend as a fixed overlay in the canvas corner (power view: colour ↔ voltage). */
function CanvasLegend({ shell }: { shell: Shell }) {
  const m = shell.module;
  if (!shell.isBlockDiagram || !m?.legend) return null;
  const legend = m.legend(shell.data());
  if (!legend) return null;
  return (
    <aside className="af-canvas-legend" aria-label={t(legend.title)}>
      <h3>{t(legend.title)}</h3>
      <ul>
        {legend.items.map(i => <li key={i.text}><span className={`af-swatch ${i.swatch}`} aria-hidden="true" /><span>{i.text}</span></li>)}
      </ul>
    </aside>
  );
}

/** Is this outline item the current selection (block diagram: one of the selected items)? */
function isSelected(shell: Shell, it: OutlineItem): boolean {
  if (shell.isBlockDiagram) return shell.gestures.selection.some(r => r.kind === it.select.kind && r.id === it.select.id);
  const sel = shell.item;
  return !!sel && sel.kind === it.select.kind && sel.id === it.select.id;
}

/** The left panel (V2 .navigator "project contents"): search, then the design's groups; a click selects and centres. */
function Outline({ shell, sections }: { shell: Shell; sections: OutlineSection[] }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase();
  const match = (it: OutlineItem) => !q || [it.label, it.sub ?? '', ...(it.lines ?? [])].join(' ').toLocaleLowerCase().includes(q);
  const found = sections.map(sec => ({ ...sec, shown: sec.items.filter(match) }));
  const none = !!q && found.every(sec => sec.shown.length === 0);
  return (
    <nav className="af-outline" aria-label={t('outline.title')}>
      <h2 className="af-outline-title">{t('outline.title')}</h2>
      <input type="search" className="af-outline-search" value={query} placeholder={t('outline.search')} aria-label={t('outline.search')}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setQuery(''); e.currentTarget.blur(); } }} />
      {none && <p className="af-outline-empty" role="status">{t('outline.empty')}</p>}
      {found.map(sec => (
        <section key={sec.id} className="af-outline-section" aria-labelledby={`af-outline-${sec.id}`}>
          <h3 id={`af-outline-${sec.id}`} className="af-outline-head">{t(sec.heading)}<span className="af-outline-count">{sec.items.length}</span></h3>
          <ul>
            {sec.shown.map(it => {
              const on = isSelected(shell, it);
              return (
                <li key={it.id}>
                  <button type="button" className={`af-outline-item${on ? ' is-active' : ''}`} aria-current={on ? 'true' : undefined}
                    onClick={() => shell.reveal({ ...it, hint: '' })}>
                    {it.sub && <small>{it.sub}</small>}
                    <span className="af-outline-label">{it.label}</span>
                    {it.lines?.map(l => <span key={l} className="af-outline-line">{l}</span>)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function Workspace({ shell }: { shell: Shell }) {
  const s = shell.store;
  const d = s.activeDesign;
  const invalid = shell.isBlockDiagram ? [...shell.routesFor(shell.data()).values()].filter(r => !r.valid).length : 0;
  const m = shell.module, data = d ? s.data(d.id) : undefined;
  const stats = m?.stats && data ? m.stats(data as never) : '';
  const hint = m?.emptyHint && data ? m.emptyHint(data as never) : null;
  const outline = m?.outline && data ? m.outline(data as never) : null;
  const explorer = shell.explorerOpen && !!outline;
  return (
    <div className="af-shell">
      <AppBar shell={shell} />
      <div className={`af-body${explorer ? '' : ' no-explorer'}`}>
        {explorer && outline && <Outline key={d?.id} shell={shell} sections={outline} />}
        <section className="af-stage" aria-label={d?.name}>
          <ViewSwitch shell={shell} />
          <Canvas key={d?.id} shell={shell} />
          <CanvasLegend shell={shell} />
          {hint && <p className="af-empty-hint">{t(hint)}</p>}
        </section>
        <InspectorPane shell={shell} />
      </div>
      <footer className="af-statusbar">
        {d && <span className="af-status-kind">{t(`design.type.${d.type}` as MessageKey)}</span>}
        {stats && <span className="af-status-stats">{stats}</span>}
        {invalid > 0 && <span className="af-status-warning">{t('status.invalidRoutes', { count: invalid })}</span>}
        {shell.embeddedStatus.text && <span className="af-status-embedded">{shell.embeddedStatus.text}</span>}
        {shell.embeddedStatus.warn && <span className="af-status-warning">{shell.embeddedStatus.warn}</span>}
        <span className="af-spacer" />
        <span className={`af-status-saved${s.dirty ? ' is-dirty' : ''}`}>{t(s.dirty ? 'status.unsaved' : 'status.saved')}</span>
        {!shell.module?.embedded && <span className="af-status-zoom">{t('status.zoom', { zoom: Math.round(shell.camera.z * 100) })}</span>}
      </footer>
      <Toasts shell={shell} />
    </div>
  );
}

export function App({ shell }: { shell: Shell }) {
  useVersion(shell.store);
  useVersion(shell.ui);
  useLocale();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (shell.dialog || shell.tool || shell.screen !== 'workspace') return;
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
      {dlg?.kind === 'organize' && <OrganizeDialog shell={shell} />}
      {dlg?.kind === 'palette' && <PaletteDialog shell={shell} />}
      {dlg?.kind === 'help' && <HelpDialog shell={shell} />}
      {dlg?.kind === 'alignGrid' && shell.isBlockDiagram && <AlignGridDialog shell={shell} />}
      {dlg?.kind === 'fonts' && shell.isBlockDiagram && <FontsDialog shell={shell} />}
      <ToolDialog shell={shell} />
    </>
  );
}
