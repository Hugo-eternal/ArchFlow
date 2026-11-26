// The floating selection bar (V2 .af2-selbar, Eg / Lu): the selected block, wire, text or task gets
// its most used actions right above it. Every button runs a registry command, so the bar, the
// keyboard and the command palette do the same thing.
import { useEffect, useRef } from 'react';
import { t, type MessageKey } from '../core/i18n';
import type { Shell } from './controller';
import { BLOCK_PRESETS, WIRE_COLORS } from './controller';
import { useVersion } from './use-store';
import { Icon, type IconName } from './icons';
import { MenuButton, shortcutText, type MenuEntry } from './AppBar';
import { WIRE_DASHES } from '../inspector/common';

type Kind = 'block' | 'part' | 'wire' | 'text' | 'task';
interface Action { id: string; arg?: unknown; icon: IconName; label: MessageKey; short?: MessageKey; menuOnly?: boolean }

/** The actions of a kind (V2 Lu); `menuOnly` ones are only in "more". */
export function actions(kind: Kind): Action[] {
  switch (kind) {
    case 'block': return [
      { id: 'item.rename', icon: 'pencil', label: 'selbar.editName', short: 'selbar.name' },
      { id: 'port.add', arg: 'in', icon: 'pinIn', label: 'selbar.addInput', short: 'selbar.input' },
      { id: 'port.add', arg: 'out', icon: 'pinOut', label: 'selbar.addOutput', short: 'selbar.output' },
      { id: 'port.add', arg: 'io', icon: 'alignBars', label: 'selbar.addIo', menuOnly: true },
      { id: 'layout.arrangeSelectedPorts', icon: 'wand', label: 'cmd.arrangePorts', menuOnly: true },
    ];
    case 'part': return [
      { id: 'item.rename', icon: 'pencil', label: 'selbar.editLabel', short: 'selbar.labelShort' },
      { id: 'part.rotate', icon: 'undo', label: 'selbar.rotateLong', short: 'selbar.rotate' },
    ];
    case 'wire': return [
      { id: 'item.rename', icon: 'pencil', label: 'selbar.editWireName', short: 'selbar.name' },
      { id: 'wire.reroute', icon: 'route', label: 'selbar.reroute' },
    ];
    case 'task': return [
      { id: 'item.rename', icon: 'pencil', label: 'selbar.renameLong', short: 'selbar.rename' },
      { id: 'schedule.append', icon: 'enter', label: 'selbar.nextLong', short: 'selbar.next' },
      { id: 'schedule.addBranch', icon: 'branch', label: 'selbar.branchLong', short: 'selbar.branch' },
    ];
    case 'text': return [];
  }
}

const deleteLabel = (kind: Kind) => `selbar.delete.${kind === 'part' ? 'block' : kind}` as MessageKey;

/** The menu of a selected item (V2 Lu with the menu-only actions, then delete): "more" and the context menu. */
export function itemMenu(shell: Shell, kind: Kind): MenuEntry[] {
  const all = actions(kind).filter(a => shell.registry.has(a.id));
  return [...all.map(a => ({ id: a.id, arg: a.arg, icon: a.icon, label: t(a.label), key: `${a.id}:${String(a.arg ?? '')}` })), 'sep', { id: 'item.delete', icon: 'trash', label: t(deleteLabel(kind)) }];
}

/** The menu of the canvas (V2 Bg): add here, arrange, grid, fit, templates, typography. */
export function canvasMenu(shell: Shell, at: { x: number; y: number }): MenuEntry[] {
  const tail: MenuEntry[] = [
    { id: 'design.manage', icon: 'grid' }, { id: 'view.fit', icon: 'fit' }, 'sep',
    { id: 'design.loadExample', icon: 'layoutTemplate' }, { id: 'theme.fonts', icon: 'sliders' },
  ];
  if (!shell.isBlockDiagram) return [{ id: 'schedule.append', icon: 'plus', label: t('ctx.addTask') }, { id: 'schedule.autoArrange', icon: 'wand' }, ...tail];
  return [
    { id: 'block.add', arg: { at }, icon: 'plus', label: t('ctx.addBlockHere') }, { id: 'text.add', arg: { at }, icon: 'type', label: t('ctx.addTextHere') }, 'sep',
    { id: 'layout.arrangePreview', icon: 'wand' }, { id: 'wire.reroute', arg: 'all', icon: 'route', label: t('ctx.rerouteAll') }, ...tail,
  ];
}

function Dash({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 22 8" aria-hidden="true" className="af-sb-dash">
      <line x1="1" y1="4" x2="21" y2="4" strokeDasharray={['', '5 3', '1.5 3'][i]} strokeLinecap="round" />
    </svg>
  );
}

export function SelectionBar({ shell }: { shell: Shell }) {
  useVersion(shell.ui);
  useVersion(shell.store);
  const bar = useRef<HTMLDivElement>(null);
  const tg = shell.selectionTarget();
  const key = tg ? `${tg.kind}:${tg.id}` : '';

  // follow the item every frame (camera, drags, layout): above it and centred unless that covers
  // other blocks, then the least covered of five other places (V2 Eg)
  const spot = useRef(0);
  useEffect(() => {
    if (!tg) return undefined;
    let raf = 0;
    spot.current = 0;
    const place = () => {
      const el = bar.current, stage = el?.parentElement;
      const item = stage?.querySelector(`svg.af-canvas [${tg.attr}="${CSS.escape(tg.id)}"]`);
      if (el && stage && item) {
        const r = item.getBoundingClientRect(), s = stage.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
        const seen = r.width + r.height > 0 && r.bottom > s.top + 8 && r.top < s.bottom - 8 && r.right > s.left && r.left < s.right;
        const cx = (x: number) => Math.max(s.left + 6, Math.min(x, s.right - w - 6)), cy = (y: number) => Math.max(s.top + 6, Math.min(y, s.bottom - h - 6));
        const above = r.top - h - 12, below = r.bottom + 12, mid = r.left + r.width / 2 - w / 2;
        const spots = [[mid, above], [mid, below], [r.left, above], [r.right - w, above], [r.left, below], [r.right - w, below]].map(([x, y]) => [cx(x), cy(y)]);
        const others = [...stage.querySelectorAll('svg.af-canvas [data-block], svg.af-canvas [data-task]')].filter(o => o !== item && !o.contains(item) && !item.contains(o)).map(o => o.getBoundingClientRect());
        const cover = ([x, y]: number[], b: DOMRect) => Math.max(0, Math.min(x + w, b.right) - Math.max(x, b.left)) * Math.max(0, Math.min(y + h, b.bottom) - Math.max(y, b.top)) / Math.max(1, b.width * b.height);
        const cost = (p: number[]) => others.reduce((n, b) => n + cover(p, b), 0) + cover(p, r) * 4;
        let best = cost(spots[spot.current]) === 0 ? spot.current : 0, low = cost(spots[best]);
        if (low > 0) spots.forEach((p, i) => { const c = cost(p); if (c < low) { low = c; best = i; } });
        spot.current = best;
        el.style.translate = `${Math.round(spots[best][0] - s.left)}px ${Math.round(spots[best][1] - s.top)}px`;
        el.dataset.visible = String(seen);
        el.dataset.busy = String(shell.gestures.busy);
      } else if (el) el.dataset.visible = 'false';
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tg) return null;
  const shown = actions(tg.kind).filter(a => !a.menuOnly && shell.registry.has(a.id) && shell.enabled(a.id));
  const d = shell.isBlockDiagram ? shell.data() : null;
  const block = tg.kind === 'block' ? d?.blocks.find(b => b.id === tg.id) : undefined;
  const line = tg.kind === 'wire' ? d?.wires.find(w => w.id === tg.id)?.line : undefined;
  const del = deleteLabel(tg.kind);
  const more = itemMenu(shell, tg.kind);
  const tip = (label: MessageKey, id: string) => { const sc = shortcutText(shell, id); return sc ? `${t(label)} (${sc})` : t(label); };

  return (
    <div ref={bar} className="af-selbar" role="toolbar" aria-label={t('selbar.label')} data-visible="false" data-busy="false" onPointerDown={e => e.stopPropagation()}>
      {shown.map(a => (
        <button key={`${a.id}:${String(a.arg ?? '')}`} type="button" className={`af-sb-btn${a.short ? ' has-label' : ''}`} aria-label={t(a.label)} data-tip={tip(a.label, a.id)}
          onClick={() => void shell.run(a.id, a.arg)}>
          <Icon name={a.icon} />{a.short && <span>{t(a.short)}</span>}
        </button>
      ))}
      {block && (
        <span className="af-sb-swatches" role="group" aria-label={t('selbar.blockStyle')}>
          {BLOCK_PRESETS.map((p, i) => {
            const label = `${t('selbar.blockStyle')} ${t(`selbar.preset.${p.name}`)}`;
            const on = block.style.fill?.toUpperCase() === p.fill && block.style.border?.toUpperCase() === p.border;
            return <button key={p.name} type="button" className="af-sb-sw" aria-label={label} data-tip={label} aria-pressed={on || undefined}
              style={{ background: p.fill, borderColor: p.border }} onClick={() => void shell.run('block.stylePreset', i)} />;
          })}
        </span>
      )}
      {line && (
        <>
          <span className="af-sb-swatches" role="group" aria-label={t('selbar.wireColor')}>
            {WIRE_COLORS.map(c => {
              const label = `${t('selbar.wireColor')} ${c}`;
              return <button key={c} type="button" className="af-sb-sw" aria-label={label} data-tip={label} aria-pressed={line.color.toUpperCase() === c || undefined}
                style={{ background: c, borderColor: c }} onClick={() => void shell.run('wire.color', c)} />;
            })}
          </span>
          <span className="af-sb-dashes" role="group" aria-label={t('cmd.wireDash')}>
            {WIRE_DASHES.map((dash, i) => (
              <button key={dash} type="button" className="af-sb-btn" aria-label={t(`inspector.dash.${dash}`)} data-tip={t(`inspector.dash.${dash}`)} aria-pressed={line.dash === dash}
                onClick={() => void shell.run('wire.dash', dash)}><Dash i={i} /></button>
            ))}
          </span>
          <button type="button" className="af-sb-btn" aria-pressed={line.arrow} aria-label={t('cmd.wireArrow')} data-tip={t(line.arrow ? 'selbar.arrowHide' : 'selbar.arrowShow')}
            onClick={() => void shell.run('wire.arrow')}><Icon name="enter" /></button>
        </>
      )}
      <button type="button" className="af-sb-btn is-danger" aria-label={t(del)} data-tip={`${t(del)} (Del)`} onClick={() => void shell.run('item.delete')}><Icon name="trash" /></button>
      <MenuButton shell={shell} label={t('selbar.more')} entries={more} className="af-sb-more" buttonClass="af-sb-btn" tip={t('selbar.more')} trigger={<Icon name="more" />} align="end" />
    </div>
  );
}
