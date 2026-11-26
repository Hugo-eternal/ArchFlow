// designs/sequence — clean a power-sequence document coming back from the vendor editor before it
// is stored (V2 shell `jf` with `Af` / `ja` / `ea` / `au`, legacy/app.zh-Hant.html L5563): at most
// 200 rows, ids /^[\w.-]{1,80}$/ and unique, known row kinds, numbers clamped, texts cut, timing
// references only to existing rows. The editor itself is vendor code (vendor/sequence-editor).
import type { SequenceDoc } from '../../io/schema-types';

type Raw = Record<string, unknown> | null | undefined;
const KINDS = new Set(['rail', 'signal', 'signalLow', 'pulse', 'data', 'clock']);

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const clamp = (v: unknown, min = -1e6, max = 1e6) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0; };
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{1,80}$/.test(v);
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? v as Record<string, unknown> : null);

function edge(t: Raw, ids: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    after: isId(t?.after) && ids.has(t!.after as string) ? t!.after : null,
    edge: t?.edge === 'start' ? 'start' : 'end',
    delay: clamp(t?.delay, 0, 1e7),
    ramp: clamp(t?.ramp, 0, 1e7),
  };
  if (t?.label) out.label = text(t.label, 40);
  if (t?.lx) out.lx = clamp(t.lx, -5e3, 5e3);
  if (t?.ly) out.ly = clamp(t.ly, -5e3, 5e3);
  if (t?.hideLabel) out.hideLabel = true;
  if (t?.hold === 'H' || t?.hold === 'L') out.hold = t.hold;
  return out;
}

/** The document as V2 stored it (same rules, same output). */
export function sanitizeSequence(raw: unknown): SequenceDoc {
  const t = obj(raw);
  const rows = Array.isArray(t?.rails) ? (t!.rails as unknown[]).slice(0, 200).map(obj) : [];
  const ids = new Set<string>();
  for (const o of rows) if (isId(o?.id) && !ids.has(o!.id as string)) ids.add(o!.id as string);
  const seen = new Set<string>(), rails: Record<string, unknown>[] = [];
  for (const o of rows) {
    if (!o || !isId(o.id) || seen.has(o.id)) continue;
    seen.add(o.id);
    const kind = KINDS.has(o.kind as string) ? o.kind as string : 'rail';
    const u: Record<string, unknown> = {
      id: o.id, name: text(o.name, 100) || 'Row', kind,
      v: o.v === '' || o.v === null || o.v === undefined ? '' : clamp(o.v, -1e4, 1e4),
      color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#2B5C8A',
      note: text(o.note, 500), on: edge(obj(o.on), ids), off: edge(obj(o.off), ids),
    };
    if (o.hidden) u.hidden = true;
    if (typeof o.tk === 'string') u.tk = text(o.tk, 60);
    const fall = obj(obj(o.on)?.fall);
    if (kind === 'pulse' && fall) {
      const f: Record<string, unknown> = {
        after: fall.after === o.id || (isId(fall.after) && ids.has(fall.after)) ? fall.after : null,
        edge: fall.edge === 'start' ? 'start' : 'end', delay: clamp(fall.delay, 0, 1e7), maybe: fall.maybe !== false, label: text(fall.label, 40),
      };
      if (fall.lx) f.lx = clamp(fall.lx, -5e3, 5e3);
      if (fall.ly) f.ly = clamp(fall.ly, -5e3, 5e3);
      if (fall.hideLabel) f.hideLabel = true;
      (u.on as Record<string, unknown>).fall = f;
    }
    rails.push(u);
  }
  const out: SequenceDoc = { name: text(t?.name, 100), rails };
  if (typeof t?.tk === 'string') out.tk = text(t.tk, 40);
  return out;
}
