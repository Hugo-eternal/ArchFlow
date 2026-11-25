// Modal dialogs of the shell: prompt, confirm and export. A plain role="dialog" with focus
// kept inside, Escape to cancel, and focus returned to where it was.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t, type MessageKey } from '../core/i18n';
import { exportFileName, exportSvg, type SvgExport } from '../export/svg';
import { fitPage, PAGE_SIZES, DEFAULT_PAGE, type PageSize } from '../export/page';
import { svgToPng, PNG_SCALES } from '../export/png';
import { readability } from '../export/readability';
import { ExportError } from '../export/errors';
import { downloadBlob } from '../io/project-file';
import type { BlockView } from '../io/schema-types';
import type { Shell, DesignChoice } from './controller';

function Modal({ title, onClose, children, wide }: { title: MessageKey; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input, select, button'))?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>('input, select, button, textarea, [tabindex="0"]')].filter(x => !x.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', key);
    return () => { el.removeEventListener('keydown', key); before?.focus?.(); };
  }, []);
  return (
    <div className="af-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`af-modal${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="af-modal-title" onKeyDown={e => e.stopPropagation()}>
        <h2 id="af-modal-title" className="af-modal-title">{t(title)}</h2>
        {children}
      </div>
    </div>
  );
}

export function PromptDialog({ shell, d }: { shell: Shell; d: Extract<Shell['dialog'], { kind: 'prompt' }> }) {
  const [value, setValue] = useState(d.value);
  return (
    <Modal title={d.title} onClose={() => shell.closeDialog()}>
      <form onSubmit={e => { e.preventDefault(); d.ok(value); }}>
        <label className="af-form-field">
          <span>{t(d.label)}</span>
          <input data-autofocus value={value} maxLength={100} onChange={e => setValue(e.target.value)} onFocus={e => e.target.select()} />
        </label>
        <div className="af-modal-actions">
          <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('dialog.cancel')}</button>
          <button type="submit" className="af-button is-primary">{t('dialog.ok')}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ shell, d }: { shell: Shell; d: Extract<Shell['dialog'], { kind: 'confirm' }> }) {
  return (
    <Modal title={d.title} onClose={() => shell.closeDialog()}>
      <p>{t(d.message, d.vars)}</p>
      <div className="af-modal-actions">
        <button type="button" className="af-button" data-autofocus onClick={() => shell.closeDialog()}>{t('dialog.cancel')}</button>
        <button type="button" className="af-button is-danger" onClick={() => { shell.closeDialog(); d.ok(); }}>{t('dialog.ok')}</button>
      </div>
    </Modal>
  );
}

export function ExportDialog({ shell }: { shell: Shell }) {
  const [format, setFormat] = useState<'svg' | 'png'>('svg');
  const [page, setPage] = useState<PageSize>(DEFAULT_PAGE);
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  // the export shows the current view unless another one is picked here (3.27a)
  const [view, setView] = useState<BlockView>(() => shell.view);
  const current = shell.data();
  const data = useMemo(() => ({ ...current, view }), [JSON.stringify(current), view]); // eslint-disable-line react-hooks/exhaustive-deps
  const exp = useMemo<SvgExport | ExportError>(() => {
    const m = shell.module;
    try { return exportSvg(data, { transparent, measure: shell.measure, routes: shell.routesFor(data), decorate: m?.decorate, extras: m?.exportExtras }); } catch (e) { if (e instanceof ExportError) return e; throw e; }
  }, [data, transparent, shell]);
  const result = exp instanceof ExportError ? null : fitPage(exp, page);
  const report = result ? readability(data, result, shell.routesFor(data), shell.measure) : null;

  const run = async () => {
    if (!result) return;
    const name = exportFileName(shell.store.projectName, shell.store.activeDesign!.name, format);
    setBusy(true); setError(null);
    try {
      const blob = format === 'svg' ? new Blob([result.source], { type: 'image/svg+xml;charset=utf-8' }) : await svgToPng(result.source, result.width, result.height, scale);
      downloadBlob(name, blob);
      shell.closeDialog();
      shell.notify('export.done', { name });
    } catch (e) {
      if (e instanceof ExportError) setError(`export.error.${e.code}` as MessageKey); else throw e;
    } finally { setBusy(false); }
  };

  return (
    <Modal title="cmd.exportOpen" onClose={() => shell.closeDialog()} wide>
      {exp instanceof ExportError ? <p className="af-form-error" role="alert">{t(`export.error.${exp.code}` as MessageKey)}</p> : (
        <>
          <fieldset className="af-form-field af-choice">
            <legend>{t('export.format')}</legend>
            {(['svg', 'png'] as const).map(f => (
              <label key={f}><input type="radio" name="af-export-format" value={f} checked={format === f} onChange={() => setFormat(f)} /><span>{f.toUpperCase()}</span></label>
            ))}
          </fieldset>
          <fieldset className="af-form-field af-choice">
            <legend>{t('export.view')}</legend>
            {(['function', 'power'] as const).map(v => (
              <label key={v}><input type="radio" name="af-export-view" value={v} checked={view === v} onChange={() => setView(v)} /><span>{t(`view.mode.${v}`)}</span></label>
            ))}
          </fieldset>
          <label className="af-form-field">
            <span>{t('export.page')}</span>
            <select value={page} onChange={e => setPage(e.target.value as PageSize)}>
              {PAGE_SIZES.map(p => <option key={p} value={p}>{t(`export.page.${p}` as MessageKey)}</option>)}
            </select>
          </label>
          {format === 'png' && (
            <label className="af-form-field">
              <span>{t('export.scale')}</span>
              <select value={scale} onChange={e => setScale(Number(e.target.value))}>
                {PNG_SCALES.map(s => <option key={s} value={s}>{`${s}×`}</option>)}
              </select>
            </label>
          )}
          <label className="af-check"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} /><span>{t('export.transparent')}</span></label>
          {report && (
            <div className={`af-readability${report.warning ? ' is-warning' : ''}`} role="status">
              {report.notes.map((n, i) => <p key={i}>{t(n.key, n.vars)}</p>)}
            </div>
          )}
          {error && <p className="af-form-error" role="alert">{t(error)}</p>}
        </>
      )}
      <div className="af-modal-actions">
        <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('dialog.cancel')}</button>
        <button type="button" className="af-button is-primary" disabled={!result || busy} onClick={() => void run()}>{t('export.download')}</button>
      </div>
    </Modal>
  );
}

/** The first registered design type, starting from its first template when it has one (V2 default). */
export function defaultChoice(shell: Shell): DesignChoice {
  const m = shell.designs.list()[0];
  return { type: m.type, template: m.templates[0]?.id };
}

/** Design type and starting point (blank or a template) as two radio groups. */
export function DesignChooser({ shell, value, onChange, legend }: { shell: Shell; value: DesignChoice; onChange: (c: DesignChoice) => void; legend: MessageKey }) {
  const modules = shell.designs.list();
  const current = shell.designs.require(value.type);
  return (
    <>
      <fieldset className="af-form-field af-choice">
        <legend>{t(legend)}</legend>
        {modules.map(m => (
          <label key={m.type}>
            <input type="radio" name="af-design-type" value={m.type} checked={value.type === m.type}
              onChange={() => onChange({ ...value, type: m.type, template: m.templates[0]?.id })} />
            <span>{t(m.label)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="af-form-field af-choice">
        <legend>{t('design.start')}</legend>
        {current.templates.map(tpl => (
          <label key={tpl.id}>
            <input type="radio" name="af-design-template" value={tpl.id} checked={value.template === tpl.id} onChange={() => onChange({ ...value, template: tpl.id })} />
            <span>{t('design.fromTemplate', { name: t(tpl.label) })}</span>
          </label>
        ))}
        <label>
          <input type="radio" name="af-design-template" value="" checked={!value.template} onChange={() => onChange({ ...value, template: undefined })} />
          <span>{t('design.blank')}</span>
        </label>
      </fieldset>
    </>
  );
}

export function NewDesignDialog({ shell }: { shell: Shell }) {
  const [choice, setChoice] = useState<DesignChoice>(() => defaultChoice(shell));
  const [name, setName] = useState('');
  return (
    <Modal title="cmd.designAdd" onClose={() => shell.closeDialog()}>
      <form onSubmit={e => { e.preventDefault(); shell.addDesign({ ...choice, name }); }}>
        <label className="af-form-field">
          <span>{t('design.name')}</span>
          <input data-autofocus value={name} maxLength={100} placeholder={t('design.nameAuto')} onChange={e => setName(e.target.value)} />
        </label>
        <DesignChooser shell={shell} value={choice} onChange={setChoice} legend="design.type" />
        <div className="af-modal-actions">
          <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('dialog.cancel')}</button>
          <button type="submit" className="af-button is-primary">{t('dialog.ok')}</button>
        </div>
      </form>
    </Modal>
  );
}
