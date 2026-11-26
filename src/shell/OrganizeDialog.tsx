// The organize dialog (V2 RC4 #v4Dialog, legacy L1817–L1855): pick a mode (organize routes /
// layered layout), compare the candidates of layout/plan.organize with the original side by side,
// and apply one as a single undo step (layout/apply.applyCandidate). Computing happens on the
// current data; if the design changes meanwhile, applying is refused (V2 fingerprint).
import { useMemo, useState } from 'react';
import { t, type MessageKey } from '../core/i18n';
import { blocksLayer } from '../render/blocks';
import { wiresLayer } from '../render/wires';
import { h, mount, r2, type VNode } from '../render/vnode';
import { contentBounds } from '../export/svg';
import { organize, ready, LayoutError, type OrganizeMode, type OrganizePlan } from '../layout/plan';
import { applyCandidate, previewOf, ApplyError } from '../layout/apply';
import type { BlockDiagram } from '../io/schema-types';
import type { Shell } from './controller';
import { Modal } from './Dialogs';

const KIND: Record<string, MessageKey> = {
  original: 'organize.kind.original', refined: 'organize.kind.refined', preserved: 'organize.kind.preserved',
  expanded: 'organize.kind.expanded', layered: 'organize.kind.layered',
};
const METRICS: { key: 'crossings' | 'invalid' | 'unwanted' | 'labelConflicts' | 'bends' | 'length'; label: MessageKey }[] = [
  { key: 'crossings', label: 'organize.metric.crossings' }, { key: 'invalid', label: 'organize.metric.invalid' },
  { key: 'unwanted', label: 'organize.metric.overlap' }, { key: 'labelConflicts', label: 'organize.metric.labels' },
  { key: 'bends', label: 'organize.metric.bends' }, { key: 'length', label: 'organize.metric.length' },
];

/** One side of the comparison, drawn with the canvas renderer in a shared view box. */
function Preview({ title, drawing, box }: { title: string; drawing: VNode; box: { x: number; y: number; w: number; h: number } }) {
  return (
    <figure className="af-organize-preview">
      <figcaption>{title}</figcaption>
      <svg viewBox={`${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}`} role="img" aria-label={title}
        ref={el => { if (el) el.replaceChildren(...mount(h('g', {}, [drawing])).childNodes); }} />
    </figure>
  );
}

function drawing(d: BlockDiagram, routes: Parameters<typeof wiresLayer>[1], shell: Shell): VNode {
  const m = shell.module;
  return h('g', {}, [wiresLayer(d, routes), blocksLayer(d, { theme: d.theme, decorate: m?.decorate })]);
}

export function OrganizeDialog({ shell }: { shell: Shell }) {
  const [mode, setMode] = useState<OrganizeMode>('routes');
  const [pick, setPick] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  // store.data() returns a fresh copy each time: key everything on the content
  const dataKey = JSON.stringify(shell.data());
  const data = useMemo(() => JSON.parse(dataKey) as BlockDiagram, [dataKey]);
  const wires = shell.gestures.selection.filter(s => s.kind === 'wire').map(s => s.id);
  const result = useMemo<OrganizePlan | LayoutError>(() => {
    try { return organize(data, { mode, ids: mode === 'routes' ? wires : [], measure: shell.measure }); }
    catch (e) { if (e instanceof LayoutError) return e; throw e; }
  }, [data, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = result instanceof LayoutError ? null : result;
  const index = plan ? pick ?? plan.best : 0;
  const cand = plan?.candidates[index];

  const views = useMemo(() => {
    if (!plan || !cand) return null;
    const before = { data, routes: shell.routesFor(data) }, after = previewOf(data, cand);
    const b1 = contentBounds(before.data, before.routes, shell.measure), b2 = contentBounds(after.data, after.routes, shell.measure);
    if (!b1 || !b2) return null;
    const x = Math.min(b1.x, b2.x) - 40, y = Math.min(b1.y, b2.y) - 40;
    const box = { x, y, w: Math.max(b1.x + b1.w, b2.x + b2.w) + 40 - x, h: Math.max(b1.y + b1.h, b2.y + b2.h) + 40 - y };
    return { box, before: drawing(before.data, before.routes, shell), after: drawing(after.data, after.routes, shell) };
  }, [plan, cand, data, shell]);

  const apply = () => {
    if (!plan || !cand) return;
    if (JSON.stringify(shell.data()) !== dataKey) { setError('organize.error.stale'); return; }
    try {
      const r = shell.edit(d => applyCandidate(d, plan, index));
      if (r.ok) { shell.closeDialog(); shell.notify('organize.applied'); }
    } catch (e) {
      if (e instanceof ApplyError) setError(`organize.error.${e.code}` as MessageKey); else throw e;
    }
  };

  return (
    <Modal title="cmd.organize" onClose={() => shell.closeDialog()} wide>
      <fieldset className="af-form-field af-choice">
        <legend>{t('organize.mode')}</legend>
        {(['routes', 'layout'] as const).map(m => (
          <label key={m}><input type="radio" name="af-organize-mode" value={m} checked={mode === m} onChange={() => { setMode(m); setPick(null); setError(null); }} /><span>{t(`organize.mode.${m}`)}</span></label>
        ))}
      </fieldset>
      {wires.length > 0 && mode === 'routes' && <p className="af-field-note">{t('organize.selected', { count: wires.length })}</p>}
      {result instanceof LayoutError && <p className="af-form-error" role="alert">{t(`organize.error.${result.code}` as MessageKey)}</p>}
      {plan && (
        <>
          <div className="af-organize-choices" role="radiogroup" aria-label={t('organize.candidates')}>
            {plan.candidates.map((c, i) => i === 0 ? null : (
              <label key={c.kind} className={`af-organize-choice${index === i ? ' is-active' : ''}`}>
                <input type="radio" name="af-organize-candidate" checked={index === i} onChange={() => { setPick(i); setError(null); }} />
                <span>{t(KIND[c.kind])}</span>
                {ready(plan, i) && <small className="af-organize-ready">{t('organize.ready')}</small>}
              </label>
            ))}
          </div>
          {plan.errors.filter(e => e.kind !== 'refined').map(e => <p key={e.kind} className="af-field-note">{t(KIND[e.kind])}: {t(`organize.error.${e.error}` as MessageKey)}</p>)}
          {plan.candidates.length === 1 && <p className="af-field-note">{t('organize.nothing')}</p>}
          {views && cand && (
            <div className="af-organize-compare">
              <Preview title={t('organize.before')} drawing={views.before} box={views.box} />
              <Preview title={t(KIND[cand.kind])} drawing={views.after} box={views.box} />
            </div>
          )}
          {cand && index > 0 && (
            <table className="af-organize-metrics">
              <thead><tr><th scope="col">{t('organize.metric')}</th><th scope="col">{t('organize.before')}</th><th scope="col">{t(KIND[cand.kind])}</th></tr></thead>
              <tbody>
                {METRICS.map(m => (
                  <tr key={m.key}><th scope="row">{t(m.label)}</th><td>{Math.round(plan.base.metrics[m.key])}</td><td>{Math.round(cand.metrics[m.key])}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {error && <p className="af-form-error" role="alert">{t(error)}</p>}
      <div className="af-modal-actions">
        <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('dialog.cancel')}</button>
        <button type="button" className="af-button is-primary" disabled={!plan || !ready(plan, index)} onClick={apply}>{t('organize.apply')}</button>
      </div>
    </Modal>
  );
}
