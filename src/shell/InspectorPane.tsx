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
    shown.current = '';
    refresh(p);
    // an item removed by an edit or undo is never synced: the panel switches first
    const off = shell.store.subscribe(() => refresh(p));
    return () => { off(); p.destroy(); panel.current = null; };
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
        <h2 className="af-pane-title">{t('inspector.title')}</h2>
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
    const i = blockInspector(ref.current, shell.store, { onRefused: r => shell.refused(r as never), groupState: groupStorage });
    insp.current = i;
    return () => { i.destroy(); insp.current = null; };
  }, [shell, designId]);

  const sel = shell.gestures.selection;
  const key = sel.length === 1 ? JSON.stringify(sel[0]) : `n${sel.length}`;
  useEffect(() => {
    const one = sel.length === 1 ? sel[0] : null;
    insp.current?.show(one, one && shell.module?.inspectorFields ? shell.module.inspectorFields(one, shell.data()) : []);
  }, [key, designId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="af-inspector-pane" aria-label={t('inspector.title')} hidden={!shell.inspectorOpen}>
      <h2 className="af-pane-title">{t('inspector.title')}</h2>
      {sel.length > 1 && <p className="af-inspector-multi">{t('inspector.multi', { count: sel.length })}</p>}
      <div ref={ref} />
    </aside>
  );
}
