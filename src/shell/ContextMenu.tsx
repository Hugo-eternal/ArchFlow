// The context menu (V2 Fg / .af2-ctx): right-click on the canvas or an item, or Shift+F10. Items are
// the selection bar's menu (an item) or the canvas actions (V2 Bg); every entry runs a command.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { t, type MessageKey } from '../core/i18n';
import type { Shell } from './controller';
import { useVersion } from './use-store';
import { Icon } from './icons';
import { shortcutText, type MenuEntry } from './AppBar';
import { canvasMenu, itemMenu } from './SelectionBar';

const HEADS: Record<string, MessageKey> = {
  block: 'inspector.head.block', part: 'inspector.head.part', wire: 'inspector.head.wire', text: 'inspector.head.text', task: 'inspector.head.task', canvas: 'ctx.canvas',
};

export function ContextMenu({ shell }: { shell: Shell }) {
  useVersion(shell.ui);
  const m = shell.contextMenu;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // place inside the window, focus the first item (V2 useLayoutEffect)
  useLayoutEffect(() => {
    if (!m || !ref.current) return;
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    setPos({ left: Math.max(6, Math.min(m.x, innerWidth - w - 6)), top: Math.max(6, Math.min(m.y, innerHeight - h - 6)) });
    ref.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [m?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // closes on a press elsewhere, Escape, resize or wheel
  useEffect(() => {
    if (!m) return undefined;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) shell.closeContextMenu(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shell.closeContextMenu(); } };
    const close = () => shell.closeContextMenu();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close);
    };
  }, [m?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return null;
  const kind = m.kind as Parameters<typeof itemMenu>[1] | 'canvas';
  const raw: MenuEntry[] = kind === 'canvas' ? canvasMenu(shell, m.at) : itemMenu(shell, kind);
  const items = raw.filter(e => e === 'sep' || 'heading' in e || shell.registry.has(e.id));
  const entries = items.filter((e, i) => e !== 'sep' || (i > 0 && i < items.length - 1 && items[i - 1] !== 'sep'));
  const label = t(HEADS[m.kind] ?? 'ctx.canvas');
  const onKey = (e: ReactKeyboardEvent) => {
    const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Tab') { e.preventDefault(); shell.closeContextMenu(); }
  };
  return (
    <div ref={ref} role="menu" aria-label={label} className="af-menu-list af-ctx" style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKey} onContextMenu={e => e.preventDefault()}>
      <div role="presentation" className="af-menu-head">{label}</div>
      {entries.map((e, i) => {
        if (e === 'sep') return <div key={`sep${i}`} role="separator" className="af-menu-sep" />;
        if ('heading' in e) return null;
        // a shortcut runs the command without this entry's argument: shown only for plain entries
        const cmd = shell.registry.get(e.id)!, sc = e.arg === undefined ? shortcutText(shell, e.id) : '';
        return (
          <button key={e.key ?? e.id} type="button" role="menuitem" className={`af-menu-item${e.id === 'item.delete' ? ' is-danger' : ''}`} tabIndex={-1}
            disabled={!shell.enabled(e.id)} aria-keyshortcuts={sc || undefined}
            onClick={() => { shell.closeContextMenu(); void shell.run(e.id, e.arg); }}>
            {e.icon && <Icon name={e.icon} />}
            <span className="af-menu-label">{e.label ?? t(cmd.label)}</span>
            {sc && <kbd className="af-menu-kbd">{sc}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
