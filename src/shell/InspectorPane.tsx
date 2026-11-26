// Properties panel frame: inspector/common.blockInspector inside an <aside>. The panel itself
// is plain DOM (built in one pass, inspector/panel.ts); React only owns the frame.
import { useEffect, useRef } from 'react';
import { t } from '../core/i18n';
import { blockInspector, type BlockInspector } from '../inspector/common';
import { InspectorPanel } from '../inspector/panel';
import type { CanvasSelection } from '../designs/module';
import type { Design } from '../io/schema-types';
import type { Shell } from './controller';
import { useVersion } from './use-store';
import { Icon } from './icons';
import { blockHead, scheduleHead, type SelectionHead } from './selection-head';
import { portLabelMode } from '../model/diagram';
import type { ScheduleData } from '../io/schema-types';

/** V2 .af2-insp-head: icon, kind, name (or a hint when idle), collapse button. */
function Head({ shell, head }: { shell: Shell; head: SelectionHead }) {
  return (
    <div className={`af-insp-head${head.idle ? ' is-idle' : ''}`}>
      <span className="af-insp-icon" aria-hidden="true"><Icon name={head.icon} /></span>
      <div className="af-insp-title">
        <span className="af-insp-kind">{t(head.kind)}</span>
        {head.idle ? <span className="af-insp-hint">{head.name}</span> : <strong className="af-insp-name">{head.name}</strong>}
      </div>
      <button type="button" className="af-btn icon" aria-label={t('inspector.collapse')} data-tip={t('inspector.collapse')}
        onClick={() => void shell.run('view.toggleInspector')}><Icon name="panelCollapse" /></button>
    </div>
  );
}

/** Nothing selected in a block diagram (V2 .af15-empty): drawing settings and what to select. */
function DrawingSettings({ shell }: { shell: Shell }) {
  const mode = portLabelMode(shell.data());
  return (
    <div className="af-insp-empty">
      <div className="af-insp-drawing">
        <p className="af-insp-sub">{t('inspector.drawing')}</p>
        <div className="af-insp-row" role="radiogroup" aria-label={t('inspector.drawing.portLabels')}>
          <span className="af-insp-row-label" aria-hidden="true">{t('inspector.drawing.portLabels')}</span>
          <span className="af-insp-seg">
            {(['inside', 'outside'] as const).map(m => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => void shell.run('layout.portLabels', m)}>
                {t(`inspector.drawing.portLabels.${m}`)}
              </button>
            ))}
          </span>
        </div>
      </div>
      <p className="af-insp-help">{t('inspector.drawing.help')}</p>
    </div>
  );
}

/** Open / closed inspector groups, remembered per browser (V2 L10536; key prefix archflow:). */
const GROUPS_KEY = 'archflow:inspector-groups';
const groupStorage = {
  get(key: string): boolean | undefined {
    try { const v = (JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>)[key]; return typeof v === 'boolean' ? v : undefined; } catch { return undefined; }
  },
  set(key: string, open: boolean): void {
    try { const all = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>; all[key] = open; localStorage.setItem(GROUPS_KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  },
};

/** Panel of a canvas design that draws itself: its fields for the selected item, or design-wide. */
function DrawingInspector({ shell }: { shell: Shell }) {
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<InspectorPanel<Design['data'], CanvasSelection> | null>(null);
  const shown = useRef('');
  useVersion(shell.ui);
  useVersion(shell.store);
  const designId = shell.store.activeDesignId;
  const data = () => shell.store.data(shell.store.activeDesignId);
  const current = (): CanvasSelection => shell.item ?? { kind: 'design', id: '' };
  /** Show the fields of the current selection (rebuild), or just refresh the values. */
  const refresh = (p: InspectorPanel<Design['data'], CanvasSelection>) => {
    const sel = current(), key = `${sel.kind}:${sel.id}`;
    if (key === shown.current) { p.sync(); return; }
    shown.current = key;
    const fields = shell.module?.canvas?.fields;
    p.show(fields ? fields(sel, data()) : [], sel);
  };

  useEffect(() => {
    if (!ref.current) return;
    const p = new InspectorPanel<Design['data'], CanvasSelection>(ref.current, {
      data, commit: edit => ({ ok: shell.editDesign(edit) }), groupState: groupStorage,
      // a list in the panel (schedule overview) selects a task and brings it into view
      select: sel => { const it = shell.module?.findItems?.(shell.store.data(shell.store.activeDesignId) as never).find(x => x.id === sel.id); if (it) shell.reveal(it); else shell.selectItem(sel); },
    });
    panel.current = p;
    shell.focusField = key => p.focus(key);
    shown.current = '';
    refresh(p);
    // an item removed by an edit or undo is never synced: the panel switches first
    const off = shell.store.subscribe(() => refresh(p));
    return () => { off(); p.destroy(); panel.current = null; shell.focusField = () => false; };
  }, [shell, designId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = current();
  useEffect(() => { if (panel.current) refresh(panel.current); }, [`${sel.kind}:${sel.id}`]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} />;
}

export function InspectorPane({ shell }: { shell: Shell }) {
  // a vendor editor has its own panels (V2 hid the inspector for sequence / flowchart designs)
  if (shell.module?.embedded) return null;
  if (shell.module?.canvas) {
    return (
      <aside className="af-inspector-pane" aria-label={t('inspector.title')} hidden={!shell.inspectorOpen}>
        {shell.store.activeDesign?.type === 'schedule' && <Head shell={shell} head={scheduleHead(shell.store.data(shell.store.activeDesignId) as ScheduleData, shell.item)} />}
        <DrawingInspector key={shell.store.activeDesignId} shell={shell} />
      </aside>
    );
  }
  return <BlockInspectorPane shell={shell} />;
}

function BlockInspectorPane({ shell }: { shell: Shell }) {
  const ref = useRef<HTMLDivElement>(null);
  const insp = useRef<BlockInspector | null>(null);
  useVersion(shell.ui);
  const designId = shell.store.activeDesignId;

  useEffect(() => {
    if (!ref.current || !shell.isBlockDiagram) return;
    const i = blockInspector(ref.current, shell.store, { onRefused: r => shell.refused(r as never), groupState: groupStorage, emptyText: null });
    insp.current = i;
    shell.focusField = key => i.panel.focus(key);
    return () => { i.destroy(); insp.current = null; shell.focusField = () => false; };
  }, [shell, designId]);

  const sel = shell.gestures.selection;
  const key = sel.length === 1 ? JSON.stringify(sel[0]) : `n${sel.length}`;
  useEffect(() => {
    const one = sel.length === 1 ? sel[0] : null;
    insp.current?.show(one, one && shell.module?.inspectorFields ? shell.module.inspectorFields(one, shell.data()) : []);
  }, [key, designId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="af-inspector-pane" aria-label={t('inspector.title')} hidden={!shell.inspectorOpen}>
      {shell.isBlockDiagram && <Head shell={shell} head={blockHead(shell.data(), sel)} />}
      {shell.isBlockDiagram && sel.length === 0 && <DrawingSettings shell={shell} />}
      <div ref={ref} />
    </aside>
  );
}
