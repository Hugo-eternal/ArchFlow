// Inspector field specs. A field describes one control in the properties panel: what it shows
// (`get`) and how a new value becomes new data (`set`, a pure function). The panel (panel.ts)
// turns a FieldSpec[] into DOM in one synchronous pass and sends every change through one
// commit function (interaction/commit.commitEdit for block diagrams).
//
// V2 built the panel in 37 layers (audit §1.4 `inspector`): later layers waited one to four
// microtasks or 0–500 ms timers and then patched the DOM an earlier layer had produced. In V3
// the complete field list for a selection comes from these specs (common.ts here, and
// DesignModule.inspectorFields from step 3.24), so the panel never changes after it is built.
import type { MessageKey } from '../core/i18n';

/** An option of a select or segmented control; `label` is an i18n key. */
/** `text`: shown as is instead of `t(label)` (user content, e.g. a task name). */
export interface FieldOption<V extends string = string> { value: V; label: MessageKey; text?: string }

interface Base<D, S> {
  /** Stable id inside one panel (also the DOM id suffix). */
  key: string;
  label: MessageKey;
  hint?: MessageKey;
  /** Hidden fields are not built at all (the list is computed once per selection). */
  visible?: (data: D, sel: S) => boolean;
  disabled?: (data: D, sel: S) => boolean;
}

interface Valued<D, S, V> extends Base<D, S> {
  get: (data: D, sel: S) => V;
  set: (data: D, sel: S, value: V) => D;
  /** Returns an error message key for an unacceptable value; nothing is committed then. */
  validate?: (value: V, data: D, sel: S) => MessageKey | null;
}

export interface TextField<D, S> extends Valued<D, S, string> {
  kind: 'text'; maxLength?: number; placeholder?: MessageKey;
  /** 'date': the browser's date input (value "YYYY-MM-DD" or ''). */
  inputType?: 'date';
}
export interface TextareaField<D, S> extends Valued<D, S, string> { kind: 'textarea'; maxLength?: number; rows?: number; placeholder?: MessageKey }
export interface NumberField<D, S> extends Valued<D, S, number> {
  kind: 'number';
  /** Unit shown after the input (not translated: px, pt, V, A …). */
  unit?: string;
  min?: number; max?: number; step?: number;
}
export interface SelectField<D, S> extends Valued<D, S, string> { kind: 'select'; options: readonly FieldOption[] }
export interface SegmentedField<D, S> extends Valued<D, S, string> { kind: 'segmented'; options: readonly FieldOption[] }
export interface ToggleField<D, S> extends Valued<D, S, boolean> { kind: 'toggle' }
export interface ColorField<D, S> extends Valued<D, S, string> {
  kind: 'color';
  /** The value meaning "no colour of its own" ('' = theme default, 'transparent' …). */
  empty?: string;
  /** Label of the button that sets `empty`; without it there is no such button. */
  emptyLabel?: MessageKey;
  /** Colour the picker shows while the value is `empty`. */
  fallback?: string;
}
export interface GroupField<D, S> extends Base<D, S> { kind: 'group'; fields: readonly FieldSpec<D, S>[]; open?: boolean }
export interface CustomField<D, S> extends Base<D, S> {
  kind: 'custom';
  /** Builds the control; `apply` commits a new data value exactly like the built-in fields. */
  render: (ctx: CustomContext<D, S>) => HTMLElement;
}
export interface CustomContext<D, S> {
  data: D; sel: S; id: string; doc: Document;
  apply: (edit: (data: D) => D) => void;
  /** Select another item (and bring it into view), when the host offers it. */
  select?: (sel: S) => void;
}

export type FieldSpec<D, S> =
  | TextField<D, S> | TextareaField<D, S> | NumberField<D, S> | SelectField<D, S>
  | SegmentedField<D, S> | ToggleField<D, S> | ColorField<D, S> | GroupField<D, S> | CustomField<D, S>;

export type ValuedField<D, S> = Exclude<FieldSpec<D, S>, GroupField<D, S> | CustomField<D, S>>;

/** Field values arrive from the DOM as strings; turn one into the field's value type. */
export function parseValue<D, S>(f: ValuedField<D, S>, raw: string | boolean): { ok: true; value: string | number | boolean } | { ok: false; error: MessageKey } {
  switch (f.kind) {
    case 'toggle': return { ok: true, value: Boolean(raw) };
    case 'number': {
      const s = String(raw).trim();
      const n = Number(s);
      if (s === '' || !Number.isFinite(n)) return { ok: false, error: 'inspector.error.number' };
      if (f.min !== undefined && n < f.min) return { ok: false, error: 'inspector.error.range' };
      if (f.max !== undefined && n > f.max) return { ok: false, error: 'inspector.error.range' };
      return { ok: true, value: n };
    }
    case 'select': case 'segmented': {
      const s = String(raw);
      return f.options.some(o => o.value === s) ? { ok: true, value: s } : { ok: false, error: 'inspector.error.option' };
    }
    case 'text': case 'textarea': {
      const s = String(raw);
      if (f.maxLength !== undefined && s.length > f.maxLength) return { ok: false, error: 'inspector.error.tooLong' };
      return { ok: true, value: s };
    }
    case 'color': {
      const s = String(raw);
      if (s === (f.empty ?? '') || /^#[0-9a-f]{6}$/i.test(s)) return { ok: true, value: s };
      return { ok: false, error: 'inspector.error.color' };
    }
  }
}

/** All fields with a value, depth first (groups flattened), as built for `data` / `sel`. */
export function flatten<D, S>(specs: readonly FieldSpec<D, S>[], data: D, sel: S): ValuedField<D, S>[] {
  const out: ValuedField<D, S>[] = [];
  const walk = (list: readonly FieldSpec<D, S>[]) => {
    for (const f of list) {
      if (f.visible && !f.visible(data, sel)) continue;
      if (f.kind === 'group') walk(f.fields);
      else if (f.kind !== 'custom') out.push(f);
    }
  };
  walk(specs);
  return out;
}
