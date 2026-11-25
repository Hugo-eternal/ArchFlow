// Command registry. Every user action — app-bar button, keyboard shortcut, command palette,
// context menu — runs a command by id; nothing in the shell clicks hidden elements or edits the
// model directly (V2's shell drove the engine by clicking ~40 hidden V1 buttons, audit §4.1).
//
// The registry is generic over its context so core does not depend on the shell: the shell
// creates `new CommandRegistry<AppContext>()` and registers the commands it offers; design
// modules contribute their own through `DesignModule.commands` (plan §2.5).
import type { MessageKey } from './i18n';

export interface Command<C> {
  id: string;
  label: MessageKey;
  /** One or more shortcuts, e.g. "Mod+Z", "Mod+Shift+Z", "Delete". Mod = Cmd on macOS, Ctrl elsewhere. */
  shortcut?: string | readonly string[];
  /** Palette / menu grouping. */
  group?: string;
  /** Disabled commands are greyed out and their shortcuts do nothing. Defaults to enabled. */
  enabled?(ctx: C): boolean;
  run(ctx: C, arg?: unknown): void | Promise<void>;
}

/** The key fields of a KeyboardEvent (so tests need no DOM). */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean;
}

interface Chord { key: string; mod: boolean; shift: boolean; alt: boolean }

const KEY_ALIASES: Record<string, string> = {
  del: 'delete', esc: 'escape', space: ' ', plus: '+', minus: '-', return: 'enter',
  up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
};

/** Parse "Mod+Shift+Z" into a chord. Throws on an empty or unknown modifier. */
export function parseShortcut(spec: string): Chord {
  // "Mod++" means Mod and the "+" key
  const parts = spec.endsWith('++') ? [...spec.slice(0, -2).split('+'), '+'] : spec.split('+');
  const chord: Chord = { key: '', mod: false, shift: false, alt: false };
  for (const [i, raw] of parts.entries()) {
    const p = raw.trim().toLowerCase();
    if (i < parts.length - 1) {
      if (p === 'mod' || p === 'ctrl' || p === 'cmd' || p === 'meta') chord.mod = true;
      else if (p === 'shift') chord.shift = true;
      else if (p === 'alt' || p === 'option') chord.alt = true;
      else throw new Error(`unknown modifier "${raw}" in shortcut "${spec}"`);
    } else chord.key = KEY_ALIASES[p] ?? p;
  }
  if (!chord.key) throw new Error(`empty shortcut "${spec}"`);
  return chord;
}

const chordId = (c: Chord) => `${c.mod ? 'M' : ''}${c.shift ? 'S' : ''}${c.alt ? 'A' : ''}:${c.key}`;

/** Does a key event match a shortcut spec? `mac` picks Cmd (true) or Ctrl (false) for Mod. */
export function matchShortcut(spec: string, ev: KeyLike, mac = false): boolean {
  return chordId(parseShortcut(spec)) === eventChordId(ev, mac);
}

function eventChordId(ev: KeyLike, mac: boolean): string | null {
  const mod = mac ? !!ev.metaKey : !!ev.ctrlKey;
  if (mac ? ev.ctrlKey : ev.metaKey) return null;           // the other platform's modifier: never a command
  let key = ev.key.toLowerCase();
  key = KEY_ALIASES[key] ?? key;
  // Shift changes the produced character for symbols ("+" vs "="); for these the key itself
  // already says it, so ignore shift.
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key);
  return chordId({ key, mod, shift: symbol ? false : !!ev.shiftKey, alt: !!ev.altKey });
}

/** Human-readable shortcut for menus and tooltips: "Ctrl+Shift+Z" or "⌘⇧Z". */
export function formatShortcut(spec: string, mac = false): string {
  const c = parseShortcut(spec);
  const key = c.key === ' ' ? 'Space' : c.key.length === 1 ? c.key.toUpperCase() : c.key[0].toUpperCase() + c.key.slice(1);
  if (mac) return `${c.mod ? '⌘' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${key}`;
  return [c.mod && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', key].filter(Boolean).join('+');
}

export class CommandRegistry<C> {
  private commands = new Map<string, Command<C>>();
  private shortcuts = new Map<string, string>();               // chord id -> command id

  /** Add a command. Ids and shortcuts must be unique; returns a function that removes it. */
  register(cmd: Command<C>): () => void {
    if (!cmd.id) throw new Error('command without id');
    if (this.commands.has(cmd.id)) throw new Error(`duplicate command "${cmd.id}"`);
    const chords = shortcutList(cmd).map(s => chordId(parseShortcut(s)));
    for (const ch of chords) {
      const other = this.shortcuts.get(ch);
      if (other) throw new Error(`shortcut of "${cmd.id}" is already used by "${other}"`);
    }
    this.commands.set(cmd.id, cmd);
    for (const ch of chords) this.shortcuts.set(ch, cmd.id);
    return () => this.unregister(cmd.id);
  }

  registerAll(cmds: readonly Command<C>[]): () => void {
    const offs = cmds.map(c => this.register(c));
    return () => offs.forEach(off => off());
  }

  unregister(id: string): void {
    const cmd = this.commands.get(id);
    if (!cmd) return;
    this.commands.delete(id);
    for (const s of shortcutList(cmd)) this.shortcuts.delete(chordId(parseShortcut(s)));
  }

  get(id: string): Command<C> | undefined { return this.commands.get(id); }
  has(id: string): boolean { return this.commands.has(id); }
  list(group?: string): Command<C>[] {
    const all = [...this.commands.values()];
    return group === undefined ? all : all.filter(c => c.group === group);
  }

  isEnabled(id: string, ctx: C): boolean {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    try { return cmd.enabled ? cmd.enabled(ctx) : true; } catch { return false; }
  }

  /** Run a command. Returns false (and does nothing) when it is unknown or disabled. */
  async run(id: string, ctx: C, arg?: unknown): Promise<boolean> {
    if (!this.isEnabled(id, ctx)) return false;
    await this.commands.get(id)!.run(ctx, arg);
    return true;
  }

  /** The command bound to a key event, if any (enabled or not). */
  forKey(ev: KeyLike, mac = false): Command<C> | undefined {
    const ch = eventChordId(ev, mac);
    const id = ch === null ? undefined : this.shortcuts.get(ch);
    return id ? this.commands.get(id) : undefined;
  }

  /**
   * Keyboard entry point: runs the enabled command bound to `ev`. Returns true when a command
   * handled the key (the caller then calls preventDefault). Typing in a text field is left alone
   * unless the shortcut uses Mod.
   */
  handleKey(ev: KeyLike & { target?: unknown }, ctx: C, mac = false): boolean {
    const cmd = this.forKey(ev, mac);
    if (!cmd) return false;
    if (isTextField(ev.target) && !(mac ? ev.metaKey : ev.ctrlKey)) return false;
    if (!this.isEnabled(cmd.id, ctx)) return false;
    void cmd.run(ctx);
    return true;
  }
}

const shortcutList = <C>(cmd: Command<C>): readonly string[] =>
  cmd.shortcut === undefined ? [] : typeof cmd.shortcut === 'string' ? [cmd.shortcut] : cmd.shortcut;

function isTextField(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
  return tag === 'input' && !['checkbox', 'radio', 'button', 'range', 'color'].includes(el.type ?? 'text');
}

/**
 * The engine actions the V2 shell reached through hidden V1 elements (audit §4.1), with the V3
 * command id that replaces each. The shell must register a command for every value here;
 * a test keeps the list complete. `null` = not a command in V3 (a reason is given).
 */
export const V2_HIDDEN_ELEMENT_COMMANDS: Record<string, string | null> = {
  add: 'block.add',
  addText: 'text.add',
  remove: 'selection.delete',
  undo: 'history.undo',
  fit: 'view.fit',
  reroute: 'wire.reroute',
  m2Reroute: 'wire.reroute',
  rcClearRoutes: 'wire.clearRoutes',
  afArrangeSelectedIO: 'layout.arrangeSelectedPorts',
  uiOpen: 'layout.arrangePreview',
  scheduleAuto: 'schedule.autoArrange',
  scheduleBranch: 'schedule.addBranch',
  toggleInspector: 'view.toggleInspector',
  exportBtn: 'export.open',
  saveProject: 'project.save',
  load: 'project.open',
  startLoad: 'project.open',
  newProject: 'project.new',
  createProject: 'project.create',
  startExamples: 'project.newFromExamples',
  startCancel: 'project.cancelNew',
  addDesign: 'design.add',
  duplicateDesign: 'design.duplicate',
  renameDesign: 'design.rename',
  deleteDesign: 'design.delete',
  workspaceManage: 'design.manage',
  designSelect: 'design.switch',
  designBtn: 'design.switch',
  examplesBtn: 'design.loadExample',
  helpBtn: 'help.open',
  stats: 'view.stats',
  chineseFont: 'theme.cjkFont',
  englishFont: 'theme.latinFont',
  // not commands: elements the V2 shell only read or measured
  view: null,                 // the canvas element (pointer events, size)
  inspector: null,            // the inspector panel element
  startScreen: null,          // start-screen visibility
  projectName: null,          // read for the title; V3 reads store.projectName
  p13Name: null,              // design-name field; V3 uses design.rename with an argument
  managedDesignType: null,    // fields of the add-design dialog: arguments of design.add
  managedDesignExample: null,
  projectSaveState: null,     // read for the "saved" badge; V3 reads store.dirty
  notice: null,               // status text; V3 uses the shell's toast
};
