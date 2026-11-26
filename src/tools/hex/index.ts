// tools/hex — Hex/Bin Editor & Compare: open a .bin or Intel HEX file, check addresses and
// checksums, edit bytes, compare two files. The V2 vendor page as is (vendor/tools/hex.html,
// legacy L10374 G4.hex); it reads window.parent.afHexHost.
import type { ToolModule } from '../module';
import page from '../../../vendor/tools/hex.html?raw';

export const hexTool: ToolModule = {
  id: 'hex',
  label: 'tool.hex.name', description: 'tool.hex.desc', long: 'tool.hex.long',
  srcdoc: () => page,
  host: 'afHexHost',
  allow: 'clipboard-read; clipboard-write',
};
