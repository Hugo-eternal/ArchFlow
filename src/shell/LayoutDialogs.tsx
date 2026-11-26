// Block-diagram layout settings (step 3.41b):
// - "Align / Grid" (V2 #workspaceManage panel: uxHorizontal / uxVertical + the gg grid bar):
//   align the selected blocks, grid shown / snapping / spacing, check the grid. Every change is
//   one undo step through shell.edit (turning snapping on puts the diagram on the grid, as V2's
//   "Preview / apply" did after its preview).
// - "Layout and fonts" (V2 #designDialog): Latin / CJK font and the four sizes, shown in pt.
import { useState } from 'react';
import { t, type MessageKey } from '../core/i18n';
import { checks, gridSize, GRID_MAX, GRID_MIN, GRID_STEP } from '../core/grid';
import { alignable } from '../model/arrange';
import { scaleBlockFonts } from '../model/diagram';
import { CJK_FONTS, cleanTheme, fontStack, LATIN_FONTS, ptToPx, pxToPt, THEME_LIMITS, type ThemeSize } from '../render/theme';
import type { BlockDiagram, Theme } from '../io/schema-types';
import type { Shell } from './controller';
import { Modal } from './Dialogs';
import { CommandButton } from './AppBar';

const SIZES: number[] = [];
for (let g = GRID_MIN; g <= GRID_MAX; g += GRID_STEP) SIZES.push(g);

export function AlignGridDialog({ shell }: { shell: Shell }) {
  const d = shell.data();
  const [report, setReport] = useState<ReturnType<typeof checks> | null>(null);
  const selected = shell.gestures.selection.filter(i => i.kind === 'block').map(i => i.id);
  const n = alignable(d, selected).length;
  const setGrid = (patch: Partial<BlockDiagram['grid']>) => { setReport(null); shell.edit(x => ({ ...x, grid: { ...x.grid, ...patch } })); };
  const g = gridSize(d.grid);
  return (
    <Modal title="cmd.alignGrid" onClose={() => shell.closeDialog()}>
      <section className="af-settings-group" aria-labelledby="af-align-title">
        <h3 id="af-align-title">{t('align.title')}</h3>
        <p className="af-settings-note" role="status">{n >= 2 ? t('align.count', { count: n }) : t('align.needTwo')}</p>
        <div className="af-settings-row">
          <CommandButton shell={shell} id="layout.alignHorizontal" />
          <CommandButton shell={shell} id="layout.alignVertical" />
          <CommandButton shell={shell} id="layout.arrangeSelectedPorts" />
        </div>
      </section>
      <section className="af-settings-group" aria-labelledby="af-grid-title">
        <h3 id="af-grid-title">{t('grid.title')}</h3>
        <label className="af-check"><input type="checkbox" checked={d.grid.show} onChange={e => setGrid({ show: e.target.checked })} /> {t('grid.show')}</label>
        <label className="af-check"><input type="checkbox" checked={d.grid.snap} onChange={e => setGrid({ snap: e.target.checked })} /> {t('grid.snap')}</label>
        <div className="af-settings-row">
          <label className="af-form-field af-inline">
            <span>{t('grid.size')}</span>
            <select value={g} onChange={e => setGrid({ size: Number(e.target.value) })}>
              {SIZES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          {[10, 20, 40].map(v => (
            <button key={v} type="button" className="af-button" aria-pressed={g === v} onClick={() => setGrid({ size: v })}>{v}</button>
          ))}
        </div>
        <p className="af-settings-note">{t(d.grid.snap ? 'grid.snapOn' : 'grid.snapOff')}</p>
        <div className="af-settings-row">
          <button type="button" className="af-button" onClick={() => setReport(checks(shell.data()))}>{t('grid.check')}</button>
        </div>
        {report && (
          <ul className="af-grid-report" aria-label={t('grid.check')}>
            {report.map(c => (
              <li key={c.id} className={c.pass ? 'is-pass' : 'is-fail'}>
                <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> {t(`grid.check.${c.id}` as MessageKey)}
                <span className="af-visually-hidden">{t(c.pass ? 'grid.pass' : 'grid.fail')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="af-modal-actions">
        <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('help.close')}</button>
      </div>
    </Modal>
  );
}

const SIZE_FIELDS: { key: ThemeSize; label: MessageKey }[] = [
  { key: 'title', label: 'fonts.title' }, { key: 'subtitle', label: 'fonts.subtitle' }, { key: 'label', label: 'fonts.label' }, { key: 'metric', label: 'fonts.metric' },
];

export function FontsDialog({ shell }: { shell: Shell }) {
  const [theme, setTheme] = useState<Theme>(() => cleanTheme(shell.data().theme));
  const [pts, setPts] = useState<Record<ThemeSize, string>>(() => Object.fromEntries(SIZE_FIELDS.map(f => [f.key, String(pxToPt(theme[f.key]))])) as Record<ThemeSize, string>);
  const bad = SIZE_FIELDS.filter(f => {
    const v = Number(pts[f.key]), [lo, hi] = THEME_LIMITS[f.key];
    return pts[f.key].trim() === '' || !Number.isFinite(v) || ptToPx(v) < lo - 1e-6 || ptToPx(v) > hi + 1e-6;
  }).map(f => f.key);
  const next = (): Theme => cleanTheme({ ...theme, ...Object.fromEntries(SIZE_FIELDS.map(f => [f.key, ptToPx(Number(pts[f.key]))])) });
  const apply = (value: Theme | undefined) => {
    const r = shell.edit(x => { const out = { ...x }; if (value) out.theme = value; else delete out.theme; return out; });
    if (r.ok) { shell.notify('fonts.applied'); shell.closeDialog(); }
  };
  const sample = bad.length ? theme : next();
  return (
    <Modal title="cmd.fonts" onClose={() => shell.closeDialog()}>
      <form onSubmit={e => { e.preventDefault(); if (!bad.length) apply(next()); }}>
        <label className="af-form-field">
          <span>{t('fonts.latin')}</span>
          <select value={theme.latinFont} onChange={e => setTheme({ ...theme, latinFont: e.target.value })}>
            {LATIN_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="af-form-field">
          <span>{t('fonts.cjk')}</span>
          <select value={theme.cjkFont} onChange={e => setTheme({ ...theme, cjkFont: e.target.value })}>
            {CJK_FONTS.map(f => <option key={f} value={f}>{t(`fonts.cjk.${f.replace(/ /g, '')}` as MessageKey)}</option>)}
          </select>
        </label>
        <div className="af-settings-grid">
          {SIZE_FIELDS.map(f => {
            const [lo, hi] = THEME_LIMITS[f.key], err = bad.includes(f.key);
            return (
              <label key={f.key} className="af-form-field">
                <span>{t(f.label)}</span>
                <input type="number" step="any" min={pxToPt(lo)} max={pxToPt(hi)} value={pts[f.key]} aria-invalid={err || undefined}
                  aria-describedby={err ? `af-font-${f.key}-err` : undefined} onChange={e => setPts({ ...pts, [f.key]: e.target.value })} />
                {err && <small id={`af-font-${f.key}-err`} className="af-form-error">{t('fonts.range', { min: pxToPt(lo), max: pxToPt(hi) })}</small>}
              </label>
            );
          })}
        </div>
        <p className="af-font-sample" style={{ fontFamily: fontStack(sample), fontSize: `${sample.title}px` }} aria-label={t('fonts.sample')}>
          IC-2048 {t('fonts.sampleCjk')} <span style={{ fontSize: `${sample.subtitle}px` }}>{t('fonts.sampleSub')}</span>
        </p>
        <p className="af-settings-note">{t('fonts.note')}</p>
        <div className="af-settings-row" role="group" aria-label={t('fonts.scale')}>
          <span className="af-settings-note">{t('fonts.scale')}</span>
          {[['\u221210%', 1 / 1.1], ['+10%', 1.1], ['+25%', 1.25]].map(([label, f]) => (
            <button key={label as string} type="button" className="af-button" onClick={() => {
              const k = f as number, base = cleanTheme(shell.data().theme);
              const scaled = cleanTheme({ ...base, title: base.title * k, subtitle: base.subtitle * k, label: base.label * k, metric: base.metric * k });
              const r = shell.edit(x => ({ ...scaleBlockFonts(x, k), theme: scaled }));
              if (r.ok) {
                setTheme(scaled);
                setPts(Object.fromEntries(SIZE_FIELDS.map(fl => [fl.key, String(pxToPt(scaled[fl.key]))])) as Record<ThemeSize, string>);
                shell.notify(k > 1 ? 'fonts.scaledUp' : 'fonts.scaledDown', { pct: Math.round(Math.abs(k - 1) * 100) });
              }
            }}>{label as string}</button>
          ))}
        </div>
        <div className="af-modal-actions">
          <button type="button" className="af-button" onClick={() => apply(undefined)} disabled={!shell.data().theme}>{t('fonts.reset')}</button>
          <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('dialog.cancel')}</button>
          <button type="submit" className="af-button is-primary" disabled={bad.length > 0}>{t('fonts.apply')}</button>
        </div>
      </form>
    </Modal>
  );
}
