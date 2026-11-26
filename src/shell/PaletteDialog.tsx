// Command palette (V2 af2-palette, Ctrl+K) and the help sheet with the shortcuts list (Ctrl+?,
// V2 #helpDialog + af2 shortcuts). The palette is a combobox over a listbox: typing filters,
// ArrowUp / ArrowDown / Home / End move the active option, Enter runs it, Escape or a click
// outside closes; focus returns to where it was.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../core/i18n';
import type { Shell } from './controller';
import { Modal } from './Dialogs';
import { filterPalette, paletteItems, SECTION_LABEL, type PaletteItem } from './palette';
import { shortcutLabel, shortcutSections } from './shortcuts';

export function PaletteDialog({ shell }: { shell: Shell }) {
  const items = useMemo(() => paletteItems(shell), [shell]);   // taken once on open, as V2 did
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const shown = filterPalette(items, query);
  const at = Math.min(active, shown.length - 1);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => { before?.focus?.(); };
  }, []);
  useEffect(() => { list.current?.querySelector(`#af-pal-${at}`)?.scrollIntoView?.({ block: 'nearest' }); }, [at]);

  const choose = (it: PaletteItem | undefined) => { if (!it) return; shell.closeDialog(); it.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    const move = (n: number) => { e.preventDefault(); setActive(Math.max(0, Math.min(shown.length - 1, n))); };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home' && e.ctrlKey) move(0);
    else if (e.key === 'End' && e.ctrlKey) move(shown.length - 1);
    else if (e.key === 'PageDown') move(at + 8);
    else if (e.key === 'PageUp') move(at - 8);
    else if (e.key === 'Enter') { e.preventDefault(); choose(shown[at]); }
    else if (e.key === 'Escape') { e.preventDefault(); shell.closeDialog(); }
    else if (e.key === 'Tab') e.preventDefault();   // focus stays in the field (the list is not tabbable)
  };

  let section: string | null = null;
  return (
    <div className="af-modal-backdrop af-palette-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) shell.closeDialog(); }}>
      <div className="af-palette" role="dialog" aria-modal="true" aria-label={t('cmd.palette')} onKeyDown={e => e.stopPropagation()}>
        <div className="af-palette-input">
          <input ref={input} value={query} placeholder={t('palette.placeholder')} aria-label={t('palette.search')}
            role="combobox" aria-expanded="true" aria-controls="af-pal-list" aria-autocomplete="list"
            aria-activedescendant={shown.length ? `af-pal-${at}` : undefined}
            onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
          <kbd className="af-menu-kbd">Esc</kbd>
        </div>
        <div ref={list} className="af-palette-list" id="af-pal-list" role="listbox" aria-label={t('cmd.palette')}>
          {shown.length === 0 && <p className="af-palette-empty">{t('palette.empty', { query })}</p>}
          {shown.map((it, i) => {
            const head = it.section !== section ? <div key={`h:${it.section}`} className="af-palette-section" role="presentation">{t(SECTION_LABEL[it.section])}</div> : null;
            section = it.section;
            return [head, (
              <div key={it.key} id={`af-pal-${i}`} role="option" aria-selected={i === at} className={`af-palette-option${i === at ? ' is-active' : ''}`}
                onPointerMove={() => { if (i !== at) setActive(i); }} onClick={() => choose(it)}>
                <span className="af-palette-label">{it.label}</span>
                {it.hint && <span className="af-palette-hint">{it.hint}</span>}
              </div>
            )];
          })}
        </div>
      </div>
    </div>
  );
}

/** Help sheet: short usage notes and every shortcut, generated from the command registry. */
export function HelpDialog({ shell }: { shell: Shell }) {
  const sections = shortcutSections(shell);
  return (
    <Modal title="cmd.help" onClose={() => shell.closeDialog()} wide>
      <div className="af-help" tabIndex={-1} data-autofocus>
        <section aria-labelledby="af-help-usage">
          <h3 id="af-help-usage">{t('help.usage')}</h3>
          <p>{t('help.palette', { keys: shortcutLabel(shell, 'palette.open') })}</p>
          <p>{t('help.editing')}</p>
          <p>{t('help.wiring')}</p>
          <p>{t('help.views')}</p>
          <p>{t('help.organize')}</p>
          <p className="af-help-note">{t('help.disclaimer')}</p>
        </section>
        <section aria-labelledby="af-help-keys">
          <h3 id="af-help-keys">{t('shortcuts.title')}</h3>
          {sections.map(s => (
            <table key={s.title} className="af-shortcuts">
              <caption>{t(s.title)}</caption>
              <thead><tr><th scope="col">{t('shortcuts.command')}</th><th scope="col">{t('shortcuts.keys')}</th></tr></thead>
              <tbody>
                {s.rows.map(r => <tr key={r.id}><td>{r.label}</td><td><kbd>{r.keys}</kbd></td></tr>)}
              </tbody>
            </table>
          ))}
        </section>
      </div>
      <div className="af-modal-actions">
        <button type="button" className="af-button" onClick={() => shell.closeDialog()}>{t('help.close')}</button>
      </div>
    </Modal>
  );
}
