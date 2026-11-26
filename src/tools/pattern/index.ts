// tools/pattern — Pattern Generator: 92 panel test patterns with editable pattern code; download
// BMPs or play them full screen. The V2 vendor page as is (vendor/tools/pattern.html, legacy L10374
// G4.pg); it reads window.parent.afPgHost. Like V2, its frame may use the clipboard, full screen
// and window management (presenting on a second screen).
import type { ToolModule } from '../module';
import page from '../../../vendor/tools/pattern.html?raw';

export const patternTool: ToolModule = {
  id: 'pattern',
  label: 'tool.pattern.name', description: 'tool.pattern.desc', long: 'tool.pattern.long',
  srcdoc: () => page,
  host: 'afPgHost',
  allow: 'clipboard-read *; clipboard-write *; fullscreen *; window-management *',
  allowFullscreen: true,
};
