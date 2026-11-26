// tools/edid — EDID Generator: panel timing to a 256-byte EDID (.bin / .hex / C array / Python).
// The page is the V2 vendor page as is (vendor/tools/edid.html, a complete document; V2 used it
// as the srcdoc, legacy L10374 G4.edid); it reads window.parent.afEdidHost and picks its
// language from host.lang.
import type { ToolModule } from '../module';
import page from '../../../vendor/tools/edid.html?raw';

export const edidTool: ToolModule = {
  id: 'edid',
  label: 'tool.edid.name', description: 'tool.edid.desc', long: 'tool.edid.long',
  srcdoc: () => page,
  host: 'afEdidHost',
  allow: 'clipboard-read; clipboard-write',
};
