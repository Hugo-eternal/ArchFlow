// The properties panel: builds DOM for a FieldSpec[] in one synchronous pass and commits every
// change through the one commit function it is given.
//
//   - text / textarea / number / colour: typing is debounced (default 400 ms) and then committed
//     once; Enter (not in a textarea), blur and the native `change` event commit at once;
//     Escape drops the pending value. One burst of typing is one undo step.
//   - select / segmented / toggle: commit on change.
//   - An invalid value (number out of range, text too long …) is shown next to the field
//     (`aria-describedby`, `aria-invalid`) and nothing is committed.
//   - A refused commit (a lock, a limit) puts the control back to the stored value.
//
// `sync()` refreshes values from the data without rebuilding (the caret stays where it is);
// the panel is rebuilt only when the selection changes or the set of visible fields changes.
// Nothing is deferred to a microtask or timer except the typing debounce (audit §1.4).
import { t, type MessageKey } from '../core/i18n';
import { flatten, parseValue, type FieldSpec, type ValuedField } from './fields';

export interface CommitOutcome { ok: boolean }

export interface PanelOptions<D, S> {
  /** Current data of the design being edited. */
  data: () => D;
  /** Commit a pure edit as one undo step (block diagrams: interaction/commit.commitEdit). */
  commit: (edit: (data: D) => D) => CommitOutcome;
  /** Called with the outcome and the selection when a commit is refused. */
  onRefused?: (outcome: CommitOutcome, sel: S) => void;
  debounceMs?: number;
  /** Select another item (custom fields: lists that jump to an item). */
  select?: (sel: S) => void;
  /** Where open / closed groups are remembered (default: in this panel only). */
  groupState?: { get(key: string): boolean | undefined; set(key: string, open: boolean): void };
  doc?: Document;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface Built<D, S> {
  field: ValuedField<D, S>;
  id: string;
  wrap: HTMLElement;
  /** Main control; segmented fields use their radio inputs instead. */
  control?: Control;
  radios?: HTMLInputElement[];
  error: HTMLElement;
  emptyButton?: HTMLButtonElement;
}

interface Pending<D, S> { built: Built<D, S>; raw: string; timer: unknown }

let panelCount = 0;

export class InspectorPanel<D, S> {
  readonly root: HTMLElement;
  private readonly o: Required<Pick<PanelOptions<D, S>, 'debounceMs' | 'setTimer' | 'clearTimer'>> & PanelOptions<D, S>;
  private readonly doc: Document;
  private readonly prefix = `af-insp-${++panelCount}`;
  private specs: readonly FieldSpec<D, S>[] = [];
  private sel: S | null = null;
  private built = new Map<string, Built<D, S>>();
  private customs: { key: string; wrap: HTMLElement; spec: Extract<FieldSpec<D, S>, { kind: 'custom' }> }[] = [];
  private signature = '';
  private pending: Pending<D, S> | null = null;
  private openGroups = new Map<string, boolean>();

  constructor(root: HTMLElement, options: PanelOptions<D, S>) {
    this.root = root;
    this.doc = options.doc ?? root.ownerDocument;
    this.o = {
      debounceMs: 400,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...options,
    };
    root.classList.add('af-inspector');
  }

  /** Build the panel for a selection (null = nothing selected: show `empty`). */
  show(specs: readonly FieldSpec<D, S>[], sel: S | null, empty: MessageKey = 'inspector.empty'): void {
    this.flush();
    this.specs = specs;
    this.sel = sel;
    this.build(empty);
  }

  /** Refresh values from the data (after undo, a canvas edit, a commit). */
  sync(): void {
    if (this.sel === null) return;
    const data = this.o.data();
    if (this.signatureOf(data) !== this.signature) {
      const focusedKey = this.focusedKey();
      this.build();
      if (focusedKey) this.focus(focusedKey);
      return;
    }
    for (const b of this.built.values()) {
      if (this.pending?.built === b) continue;
      this.writeValue(b, data);
    }
    for (const c of this.customs) {
      if (c.wrap.contains(this.doc.activeElement)) continue;
      c.wrap.replaceChildren(this.renderCustom(c.spec, data));
    }
  }

  /** Commit a pending typed value now. */
  flush(): void {
    const p = this.pending;
    if (!p) return;
    this.o.clearTimer(p.timer);
    this.pending = null;
    this.apply(p.built, p.raw);
  }

  /** Move keyboard focus to a field (by key). */
  focus(key: string): boolean {
    const b = this.built.get(key);
    const el = b?.control ?? b?.radios?.find(r => r.checked) ?? b?.radios?.[0];
    if (!el) return false;
    el.focus();
    return true;
  }

  destroy(): void {
    if (this.pending) this.o.clearTimer(this.pending.timer);
    this.pending = null;
    this.root.replaceChildren();
    this.built.clear();
    this.customs = [];
  }

  // ------------------------------------------------------------------ building

  private build(empty: MessageKey = 'inspector.empty'): void {
    this.built.clear();
    this.customs = [];
    const frag = this.doc.createDocumentFragment();
    if (this.sel === null) {
      const p = this.el('p', 'af-inspector-empty');
      p.textContent = t(empty);
      frag.append(p);
      this.signature = '';
    } else {
      const data = this.o.data();
      this.signature = this.signatureOf(data);
      this.buildList(frag, this.specs, data, '');
    }
    this.root.replaceChildren(frag);
  }

  private buildList(parent: Node, specs: readonly FieldSpec<D, S>[], data: D, path: string): void {
    const sel = this.sel as S;
    for (const f of specs) {
      if (f.visible && !f.visible(data, sel)) continue;
      if (f.kind === 'group') {
        const key = path + f.key;
        const details = this.el('details', 'af-field-group');
        details.dataset.group = f.key;
        details.open = this.openGroups.get(key) ?? this.o.groupState?.get(key) ?? f.open ?? true;
        details.addEventListener('toggle', () => { this.openGroups.set(key, details.open); this.o.groupState?.set(key, details.open); });
        const summary = this.el('summary');
        summary.textContent = t(f.label);
        details.append(summary);
        this.buildList(details, f.fields, data, key + '/');
        parent.appendChild(details);
      } else if (f.kind === 'custom') {
        const wrap = this.el('div', 'af-field af-field-custom');
        wrap.dataset.field = f.key;
        wrap.append(this.renderCustom(f, data));
        this.customs.push({ key: f.key, wrap, spec: f });
        parent.appendChild(wrap);
      } else {
        parent.appendChild(this.buildField(f, data));
      }
    }
  }

  private buildField(f: ValuedField<D, S>, data: D): HTMLElement {
    const id = `${this.prefix}-${f.key}`;
    const wrap = this.el('div', `af-field af-field-${f.kind}`);
    wrap.dataset.field = f.key;
    const error = this.el('p', 'af-field-error');
    error.id = `${id}-error`;
    error.hidden = true;
    error.setAttribute('role', 'alert');
    const describedBy = [error.id];
    let hint: HTMLElement | undefined;
    if (f.hint) {
      hint = this.el('p', 'af-field-hint');
      hint.id = `${id}-hint`;
      hint.textContent = t(f.hint);
      describedBy.unshift(hint.id);
    }
    const b: Built<D, S> = { field: f, id, wrap, error };

    if (f.kind === 'segmented') {
      const fs = this.el('fieldset', 'af-segmented');
      fs.setAttribute('aria-describedby', describedBy.join(' '));
      const legend = this.el('legend');
      legend.textContent = t(f.label);
      fs.append(legend);
      b.radios = f.options.map((opt, i) => {
        const label = this.el('label', 'af-segment');
        const r = this.el('input');
        r.type = 'radio';
        r.name = id;
        r.value = opt.value;
        r.id = `${id}-${i}`;
        r.addEventListener('change', () => { if (r.checked) this.commitNow(b, r.value); });
        const span = this.el('span');
        span.textContent = opt.text ?? t(opt.label);
        label.append(r, span);
        fs.append(label);
        return r;
      });
      wrap.append(fs);
    } else if (f.kind === 'toggle') {
      const label = this.el('label', 'af-toggle');
      const c = this.el('input');
      c.type = 'checkbox';
      c.setAttribute('role', 'switch');
      c.id = id;
      c.setAttribute('aria-describedby', describedBy.join(' '));
      c.addEventListener('change', () => this.commitNow(b, c.checked));
      const span = this.el('span');
      span.textContent = t(f.label);
      label.append(c, span);
      wrap.append(label);
      b.control = c;
    } else {
      const label = this.el('label', 'af-field-label');
      label.htmlFor = id;
      label.textContent = t(f.label);
      const c = this.makeControl(f);
      c.id = id;
      c.setAttribute('aria-describedby', describedBy.join(' '));
      b.control = c;
      const row = this.el('div', 'af-field-row');
      row.append(c);
      if (f.kind === 'text' && f.suggestions?.length) {
        const list = this.el('datalist');
        list.id = `${id}-list`;
        for (const v of f.suggestions) { const o = this.el('option'); o.value = v; list.append(o); }
        c.setAttribute('list', list.id);
        row.append(list);
      }
      if (f.kind === 'number' && f.unit) {
        const u = this.el('span', 'af-field-unit');
        u.textContent = f.unit;
        u.setAttribute('aria-hidden', 'true');
        row.append(u);
      }
      if (f.kind === 'color' && f.emptyLabel) {
        const btn = this.el('button', 'af-field-reset');
        btn.type = 'button';
        btn.textContent = t(f.emptyLabel);
        btn.addEventListener('click', () => this.commitNow(b, f.empty ?? ''));
        b.emptyButton = btn;
        row.append(btn);
      }
      wrap.append(label, row);
      this.listen(b, c);
    }
    if (hint) wrap.append(hint);
    wrap.append(error);
    this.writeValue(b, data);
    this.built.set(f.key, b);
    return wrap;
  }

  private makeControl(f: ValuedField<D, S>): Control {
    switch (f.kind) {
      case 'textarea': {
        const c = this.el('textarea');
        c.rows = f.rows ?? 3;
        if (f.maxLength !== undefined) c.maxLength = f.maxLength;
        if (f.placeholder) c.placeholder = t(f.placeholder);
        return c;
      }
      case 'select': {
        const c = this.el('select');
        for (const opt of f.options) {
          const o = this.el('option');
          o.value = opt.value;
          o.textContent = opt.text ?? t(opt.label);
          c.append(o);
        }
        return c;
      }
      case 'number': {
        const c = this.el('input');
        c.type = 'number';
        c.inputMode = 'decimal';
        if (f.min !== undefined) c.min = String(f.min);
        if (f.max !== undefined) c.max = String(f.max);
        c.step = f.step !== undefined ? String(f.step) : 'any';
        return c;
      }
      case 'color': {
        const c = this.el('input');
        c.type = 'color';
        return c;
      }
      default: {
        const c = this.el('input');
        c.type = 'text';
        if (f.kind === 'text') {
          if (f.inputType === 'date') c.type = 'date';
          if (f.maxLength !== undefined) c.maxLength = f.maxLength;
          if (f.placeholder) c.placeholder = t(f.placeholder);
        }
        return c;
      }
    }
  }

  private listen(b: Built<D, S>, c: Control): void {
    const f = b.field;
    if (f.kind === 'select') {
      c.addEventListener('change', () => this.commitNow(b, c.value));
      return;
    }
    c.addEventListener('input', () => this.schedule(b, c.value));
    c.addEventListener('change', () => this.commitNow(b, c.value));
    c.addEventListener('blur', () => { if (this.pending?.built === b) this.flush(); });
    c.addEventListener('keydown', e => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter' && (f.kind !== 'textarea' || ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        this.commitNow(b, c.value);
      } else if (ev.key === 'Escape' && this.pending?.built === b) {
        ev.preventDefault();
        ev.stopPropagation();
        this.o.clearTimer(this.pending.timer);
        this.pending = null;
        this.setError(b, null);
        this.writeValue(b, this.o.data());
      }
    });
  }

  private renderCustom(spec: Extract<FieldSpec<D, S>, { kind: 'custom' }>, data: D): HTMLElement {
    return spec.render({
      data, sel: this.sel as S, id: `${this.prefix}-${spec.key}`, doc: this.doc,
      apply: edit => this.commitEditFn(edit),
      select: this.o.select,
    });
  }

  // ------------------------------------------------------------------ values

  private writeValue(b: Built<D, S>, data: D): void {
    const f = b.field, sel = this.sel as S;
    const disabled = f.disabled?.(data, sel) ?? false;
    const v = f.get(data, sel as S);
    if (b.radios) {
      for (const r of b.radios) { r.checked = r.value === v; r.disabled = disabled; }
      return;
    }
    const c = b.control!;
    c.disabled = disabled;
    if (f.kind === 'toggle') { (c as HTMLInputElement).checked = Boolean(v); return; }
    let s: string;
    if (f.kind === 'color') {
      const empty = f.empty ?? '';
      s = v === empty || !/^#[0-9a-f]{6}$/i.test(String(v)) ? f.fallback ?? '#000000' : String(v).toLowerCase();
      c.dataset.empty = String(v === empty);
      if (b.emptyButton) b.emptyButton.disabled = disabled || v === empty;
    } else {
      s = String(v);
    }
    if (c.value !== s) c.value = s;
  }

  private schedule(b: Built<D, S>, raw: string): void {
    if (this.stale(b)) return;
    if (this.pending && this.pending.built !== b) this.flush();
    if (this.pending) this.o.clearTimer(this.pending.timer);
    const parsed = parseValue(b.field, raw);
    this.setError(b, parsed.ok ? null : parsed.error);
    const timer = this.o.setTimer(() => { if (this.pending?.timer === timer) this.flush(); }, this.o.debounceMs);
    this.pending = { built: b, raw, timer };
  }

  /** Events from controls of an earlier build (removing a focused input fires change / blur). */
  private stale(b: Built<D, S>): boolean { return this.built.get(b.field.key) !== b; }

  private commitNow(b: Built<D, S>, raw: string | boolean): void {
    if (this.stale(b)) return;
    if (this.pending) {
      this.o.clearTimer(this.pending.timer);
      if (this.pending.built !== b) { const p = this.pending; this.pending = null; this.apply(p.built, p.raw); }
      this.pending = null;
    }
    this.apply(b, raw);
  }

  private apply(b: Built<D, S>, raw: string | boolean): void {
    const f = b.field, sel = this.sel as S;
    const parsed = parseValue(f, raw);
    if (!parsed.ok) { this.setError(b, parsed.error); return; }
    const data = this.o.data();
    const value = parsed.value as never;
    const custom = f.validate?.(value, data, sel);
    if (custom) { this.setError(b, custom); return; }
    this.setError(b, null);
    if (Object.is(f.get(data, sel), value)) return;
    this.commitEditFn(d => f.set(d, sel, value));
  }

  private commitEditFn(edit: (d: D) => D): void {
    const r = this.o.commit(edit);
    if (!r.ok) this.o.onRefused?.(r, this.sel as S);
    this.sync();
  }

  private setError(b: Built<D, S>, key: MessageKey | null): void {
    b.error.hidden = key === null;
    b.error.textContent = key === null ? '' : t(key);
    const targets: Element[] = b.radios ? [b.wrap.querySelector('fieldset')!] : [b.control!];
    for (const el of targets) {
      if (key === null) el.removeAttribute('aria-invalid');
      else el.setAttribute('aria-invalid', 'true');
    }
  }

  // ------------------------------------------------------------------ helpers

  private signatureOf(data: D): string {
    if (this.sel === null) return '';
    const sel = this.sel;
    const keys: string[] = [];
    const walk = (list: readonly FieldSpec<D, S>[]) => {
      for (const f of list) {
        if (f.visible && !f.visible(data, sel)) continue;
        keys.push(f.key);
        if (f.kind === 'group') walk(f.fields);
      }
    };
    walk(this.specs);
    return keys.join('|');
  }

  private focusedKey(): string | null {
    const a = this.doc.activeElement;
    if (!a || !this.root.contains(a)) return null;
    return (a.closest('[data-field]') as HTMLElement | null)?.dataset.field ?? null;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
    const e = this.doc.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
}

/** Field values as currently shown, for tests and debugging. */
export function fieldKeys<D, S>(specs: readonly FieldSpec<D, S>[], data: D, sel: S): string[] {
  return flatten(specs, data, sel).map(f => f.key);
}
