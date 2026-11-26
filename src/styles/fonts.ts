// The embedded Source Han Sans TC subset (vendor/fonts, from the V2.10.1 wrapper's AF_FONT_CSS):
// V2 put it in a <style id="af2-fonts"> of the app and of the sequence, flowchart and BOM frames,
// so the interface and the drawings look the same on machines without the font installed.
import fontCss from '../../vendor/fonts/source-han-sans-tc.css?raw';

export const FONT_CSS: string = fontCss;

/** Add the font faces to a document (once). */
export function installFonts(doc: Document = document): void {
  if (doc.getElementById('af-fonts')) return;
  const style = doc.createElement('style');
  style.id = 'af-fonts';
  style.textContent = FONT_CSS;
  doc.head.prepend(style);
}

/** Wait for the regular and bold faces (font-display: block), at most `ms`, so text is measured with them. */
export async function fontsReady(doc: Document = document, ms = 3000): Promise<void> {
  const fonts = doc.fonts;
  if (!fonts?.load) return;
  const load = Promise.all(['400 16px "Source Han Sans TC"', '700 16px "Source Han Sans TC"'].map(f => fonts.load(f, '\u67b6A')));
  await Promise.race([load.catch(() => undefined), new Promise(r => setTimeout(r, ms))]);
}
