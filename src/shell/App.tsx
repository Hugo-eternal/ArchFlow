// The V3 shell: start screen, or the workspace (app bar, project contents, canvas, properties panel,
// status bar) with its dialogs. All actions are registry commands (controller.ts).
import { useEffect, useRef, useState } from 'react';
import { t, getLocale, type MessageKey } from '../core/i18n';
import { formatShortcut } from '../core/commands';
import { APP_CREDIT } from '../version';
import { isMac, type Shell } from './controller';
import type { OutlineItem, OutlineSection } from '../designs/module';
import { useVersion } from './use-store';
import { Canvas } from './Canvas';
import { InspectorPane } from './InspectorPane';
import { ConfirmDialog, ExportDialog, NewDesignDialog, PromptDialog } from './Dialogs';
import { OrganizeDialog } from './OrganizeDialog';
import { SelectionBar } from './SelectionBar';
import { ContextMenu } from './ContextMenu';
import { HelpDialog, PaletteDialog } from './PaletteDialog';
import { AlignGridDialog, FontsDialog, ScheduleSnapDialog } from './LayoutDialogs';
import { StartScreen } from './StartScreen';
import { AppBar, designKind, shortcutText, useLocale } from './AppBar';
import { gridSize } from '../core/grid';
import { Icon, type IconName } from './icons';

function FileInput({ shell }: { shell: Shell }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { shell.pickFile = () => ref.current?.click(); }, [shell]);
  return (
    <input ref={ref} type="file" accept=".json,application/json" className="af-visually-hidden" tabIndex={-1} aria-hidden="true"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void shell.openBlob(f); }} />
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

/** V2 .zoomtools: zoom out, the percentage (back to 100 %), zoom in. */
function ZoomControl({ shell }: { shell: Shell }) {
  const z = Math.round(shell.camera.z * 100);
  return (
    <div className="af-zoom" role="group" aria-label={t('zoom.label')}>
      <button type="button" aria-label={t('cmd.zoomOut')} data-tip={t('cmd.zoomOut')} onClick={() => void shell.run('view.zoomOut')}>{'\u2212'}</button>
      <button type="button" className="af-zoom-pct" aria-label={t('zoom.reset', { zoom: z })} data-tip={t('cmd.zoomReset')} onClick={() => void shell.run('view.zoomReset')}>{z}%</button>
      <button type="button" aria-label={t('cmd.zoomIn')} data-tip={t('cmd.zoomIn')} onClick={() => void shell.run('view.zoomIn')}>{'\uff0b'}</button>
    </div>
  );
}

/** "Seen the tips" is remembered per browser (V2 archflow-v2-tips-seen). */
const TIPS_KEY = 'archflow:tips-seen';
const tipsSeen = (): boolean => { try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; } };

/** V2 .af2-tips: the first-run card over the canvas (selection bar, right-click, single keys). */
function TipsCard({ shell }: { shell: Shell }) {
  const [seen, setSeen] = useState(tipsSeen);
  if (seen) return null;
  const done = () => { setSeen(true); try { localStorage.setItem(TIPS_KEY, '1'); } catch { /* storage unavailable */ } };
  const keys: [string, MessageKey][] = shell.isBlockDiagram
    ? [['block.add', 'tips.key.block'], ['text.add', 'tips.key.text'], ['design.manage', 'tips.key.grid'], ['view.fit', 'tips.key.fit']]
    : [['schedule.append', 'tips.key.next'], ['schedule.addBranch', 'tips.key.branch'], ['view.fit', 'tips.key.fit']];
  const shown = keys.map(([id, label]) => [shortcutText(shell, id), label] as const).filter(([k]) => k);
  const row = (icon: IconName, body: React.ReactNode) => <li><Icon name={icon} /><span>{body}</span></li>;
  return (
    <aside className="af-tips" aria-label={t('tips.label')}>
      <div className="af-tips-head">
        <strong>{t('tips.title')}</strong>
        <button type="button" className="af-btn icon" aria-label={t('tips.dismiss')} onClick={done}><Icon name="close" /></button>
      </div>
      <ul>
        {row('pointer', t(shell.isBlockDiagram ? 'tips.selbar.diagram' : 'tips.selbar.schedule'))}
        {row('more', t('tips.context'))}
        {shown.length > 0 && row('keyboard', <>{t('tips.keys')}{shown.map(([k, label]) => <span key={label} className="af-tips-key"><kbd className="af-kbd">{k}</kbd> {t(label)}</span>)}</>)}
      </ul>
      <div className="af-tips-foot">
        <button type="button" className="af-link" onClick={() => { done(); void shell.run('help.open'); }}>{t('tips.allShortcuts')}</button>
        <button type="button" className="af-btn primary" onClick={done}>{t('tips.gotIt')}</button>
      </div>
    </aside>
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
          <SelectionBar shell={shell} />
          {!shell.module?.embedded && <ZoomControl shell={shell} />}
          {!shell.module?.embedded && (shell.isBlockDiagram || shell.module?.canvas) && (
            <p className="af-canvas-hint" aria-hidden="true">{shell.isBlockDiagram ? t('canvas.hint.diagram', { size: gridSize(shell.data().grid) }) : t('canvas.hint.schedule')}</p>
          )}
          {!shell.module?.embedded && <TipsCard shell={shell} />}
          <ContextMenu shell={shell} />
          {hint && <p className="af-empty-hint">{t(hint)}</p>}
        </section>
        <InspectorPane shell={shell} />
      </div>
      <footer className="af-statusbar" role="status">
        {d && <span className="af-status-kind"><Icon name={designKind(d.type, data).icon} />{t(designKind(d.type, data).label)}</span>}
        {stats && <span className="af-status-stats">{stats}</span>}
        {shell.embeddedStatus.text && <span className="af-status-stats">{shell.embeddedStatus.text}</span>}
        {invalid > 0 && <span className="af-status-warning">{t('status.invalidRoutes', { count: invalid })}</span>}
        {shell.embeddedStatus.warn && <span className="af-status-warning">{shell.embeddedStatus.warn}</span>}
        {shell.message && <span className={`af-status-notice${shell.message.tone === 'error' ? ' is-error' : ''}`}>{t(shell.message.key, shell.message.vars)}</span>}
        <span className="af-spacer" />
        <span className="af-status-who">{APP_CREDIT}</span>
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
      {dlg?.kind === 'scheduleSnap' && shell.store.activeDesign?.type === 'schedule' && <ScheduleSnapDialog shell={shell} />}
      {dlg?.kind === 'fonts' && shell.isBlockDiagram && <FontsDialog shell={shell} />}
      <ToolDialog shell={shell} />
    </>
  );
}
