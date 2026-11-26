// The tool interface (docs/v3-plan.md §2.5 ToolModule) and its registry. A tool is a vendor page
// shown in an iframe over the shell (V2 af2-tooldlg); it needs no project. Each tools/<x> imports
// only core/i18n and its own vendor files (plan §1.2 rule 4); src/app.ts registers them.
import type { MessageKey } from '../core/i18n';

export type ToolLang = 'zh-Hant' | 'en';

export interface ToolModule {
  id: string;
  /** Tile title, short and long descriptions (V2 yu: name / desc / long). */
  label: MessageKey; description: MessageKey; long: MessageKey;
  /** The frame document. */
  srcdoc(lang: ToolLang): string;
  /** Global name of the host object the tool reads from its parent window: { lang, close(), toast(text) }. */
  host: string;
  /** iframe `allow` (permissions the tool needs). */
  allow?: string;
  allowFullscreen?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolModule>();
  register(t: ToolModule): void {
    if (this.tools.has(t.id)) throw new Error(`tool ${t.id} registered twice`);
    this.tools.set(t.id, t);
  }
  get(id: string): ToolModule | undefined { return this.tools.get(id); }
  list(): ToolModule[] { return [...this.tools.values()]; }
}
