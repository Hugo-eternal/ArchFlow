// Properties panel frame: inspector/common.blockInspector inside an <aside>. The panel itself
// is plain DOM (built in one pass, inspector/panel.ts); React only owns the frame.
import { useEffect, useRef } from 'react';
import { t } from '../core/i18n';
import { blockInspector, type BlockInspector } from '../inspector/common';
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

export function InspectorPane({ shell }: { shell: Shell }) {
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
    insp.current?.show(sel.length === 1 ? sel[0] : null);
  }, [key, designId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="af-inspector-pane" aria-label={t('inspector.title')} hidden={!shell.inspectorOpen}>
      <h2 className="af-pane-title">{t('inspector.title')}</h2>
      {sel.length > 1 && <p className="af-inspector-multi">{t('inspector.multi', { count: sel.length })}</p>}
      <div ref={ref} />
    </aside>
  );
}
