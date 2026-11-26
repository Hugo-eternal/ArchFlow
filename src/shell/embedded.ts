// The host side of the vendor editors (V2 bundles in an iframe, DesignModule.embedded). Each
// editor reads `window.parent[<host>]` once when its bundle starts, so the host objects are
// published on this window when the shell starts and always talk to the current shell.
//
// V2: window.afSeqHost (legacy L5563), window.afFlowHost (L5765, plus `images`): getDoc / change / status / toast / save / palette /
// shortcuts / title / modal / ready / poke. Documents coming back are cleaned by the module
// (sanitize) and stored without a V3 undo step: the editor keeps its own undo, and the shell's
// undo / redo commands are routed to it (Shell.embeddedHistory).
import { getLocale } from '../core/i18n';
import type { DesignModule, EmbeddedApi } from '../designs/module';
import type { Shell } from './controller';

/** The API of the editor in the mounted frame, if any. */
export function frameApi(shell: Shell): EmbeddedApi | null {
  const m = shell.module?.embedded;
  if (!m || !shell.frame) return null;
  try { return ((shell.frame.contentWindow as unknown as Record<string, unknown> | null)?.[m.api] as EmbeddedApi) ?? null; } catch { return null; }
}

function hostFor(shell: Shell, module: DesignModule) {
  const active = () => (shell.store.activeDesign?.type === module.type ? shell.store.activeDesign : undefined);
  return {
    get lang() { return getLocale() === 'en' ? 'en' : 'zh'; },
    getDoc() { const d = active(); return d ? { id: d.id, doc: shell.store.data(d.id) } : null; },
    change(doc: unknown, id: string) {
      const d = shell.store.designs.find(x => x.id === id);
      if (!d || d.type !== module.type) return;
      shell.store.setData(id, module.embedded!.sanitize(doc) as never);
    },
    status(s: { text?: string; warn?: string } | null) { shell.setEmbeddedStatus(s?.text ?? '', s?.warn ?? ''); },
    toast(t: { text?: string } | null) { if (t?.text) shell.notify('embedded.status', { text: t.text }); },
    save() { void shell.run('project.save'); },
    palette() { /* no command palette yet (shell 3.39–3.41) */ },
    shortcuts() { /* no shortcut sheet yet */ },
    title() { return active()?.name ?? ''; },
    modal(_open: boolean) { /* the editor's dialogs stay inside its frame */ },
    ready() { shell.embeddedReady(); },
    poke() { /* V2 closed its own menus; the V3 shell has none open over the frame */ },
    ...module.embedded!.hostExtras?.(),
  };
}

/** Publish the host object of every embedded design module on `win`. */
export function installHosts(shell: Shell, win: Window = window): void {
  for (const m of shell.designs.list()) if (m.embedded) (win as unknown as Record<string, unknown>)[m.embedded.host] = hostFor(shell, m);
}

/** Publish each tool's host object (V2: afRsiHost / afEdidHost / afHexHost / afPgHost = { lang, close, toast }). */
export function installToolHosts(shell: Shell, win: Window = window): void {
  for (const tool of shell.tools.list()) {
    (win as unknown as Record<string, unknown>)[tool.host] = {
      get lang() { return getLocale() === 'en' ? 'en' : 'zh'; },
      close: () => shell.closeTool(),
      toast: (text: string) => { if (text) shell.notify('embedded.status', { text: String(text) }); },
    };
  }
}
