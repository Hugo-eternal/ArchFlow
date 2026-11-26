// The properties panel head (V2 A4 / .af2-insp-head): an icon, what is selected and its name, or
// a hint when nothing is selected. Block diagrams describe their ItemRef selection; a schedule
// its task / link.
import { t, type MessageKey } from '../core/i18n';
import type { BlockDiagram, ItemRef } from '../model/types';
import type { ScheduleData } from '../io/schema-types';
import type { CanvasSelection } from '../designs/module';
import type { IconName } from './icons';

export interface SelectionHead { icon: IconName; kind: MessageKey; name: string; idle?: boolean; count?: number }

const firstLine = (s: string) => s.split('\n')[0].trim();

function blockName(d: BlockDiagram, id: string): string {
  const b = d.blocks.find(x => x.id === id);
  return b ? b.partNumber || b.title || t('outline.unnamed') : '';
}

function endName(d: BlockDiagram, e: { block: string; port: string } | { junction: string }): string {
  if ('junction' in e) return d.junctions.find(j => j.id === e.junction)?.name ?? '';
  return blockName(d, e.block);
}

/** The head of a block diagram's panel for its selection. */
export function blockHead(d: BlockDiagram, sel: readonly ItemRef[]): SelectionHead {
  if (sel.length > 1) return { icon: 'pointer', kind: 'inspector.head.multi', name: t('inspector.multi', { count: sel.length }), count: sel.length };
  const s = sel[0];
  if (!s) return { icon: 'pointer', kind: 'inspector.head.none', name: t('inspector.head.hint.diagram'), idle: true };
  switch (s.kind) {
    case 'block': {
      const b = d.blocks.find(x => x.id === s.id);
      return { icon: 'box', kind: b?.connector ? 'inspector.head.connector' : b?.part ? 'inspector.head.part' : 'inspector.head.block', name: blockName(d, s.id) };
    }
    case 'wire': {
      const w = d.wires.find(x => x.id === s.id);
      const ends = w ? `${endName(d, w.a)} → ${endName(d, w.b)}` : '';
      return { icon: 'activity', kind: 'inspector.head.wire', name: w?.name || ends || t('outline.unnamed') };
    }
    case 'port': {
      const p = d.blocks.find(x => x.id === s.block)?.ports.find(x => x.id === s.id);
      return { icon: 'pinIn', kind: 'inspector.head.port', name: [p?.name, blockName(d, s.block)].filter(Boolean).join(' · ') };
    }
    case 'junction': return { icon: 'branch', kind: 'inspector.head.junction', name: d.junctions.find(j => j.id === s.id)?.name ?? '' };
    case 'text': return { icon: 'type', kind: 'inspector.head.text', name: firstLine(d.texts.find(x => x.id === s.id)?.text ?? '') || t('outline.unnamed') };
    case 'frame': return { icon: 'frame', kind: 'inspector.head.frame', name: d.frames.find(x => x.id === s.id)?.title || t('outline.unnamed') };
  }
}

/** The head of a schedule's panel. */
export function scheduleHead(d: ScheduleData, sel: CanvasSelection | null): SelectionHead {
  const task = (id: string) => d.tasks.find(x => x.id === id);
  if (sel?.kind === 'task') return { icon: 'schedule', kind: 'inspector.head.task', name: task(sel.id)?.title || t('schedule.untitled') };
  if (sel?.kind === 'link') {
    const l = d.links.find(x => x.id === sel.id);
    return { icon: 'flow', kind: 'inspector.head.link', name: l ? `${task(l.from)?.title ?? ''} → ${task(l.to)?.title ?? ''}` : '' };
  }
  return { icon: 'pointer', kind: 'inspector.head.none', name: t('inspector.head.hint.schedule'), idle: true };
}
