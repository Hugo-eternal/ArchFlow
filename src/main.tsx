// V3 entry point: styles, locale, then the React shell.
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/canvas.css';
import './styles/inspector.css';
import { createRoot } from 'react-dom/client';
import { initLocale } from './core/i18n';
import { canvasMeasure } from './render/texts';
import { createApp } from './app';
import { App } from './shell/App';
import { fontsReady, installFonts } from './styles/fonts';

initLocale();
installFonts();
// measure text with the embedded font, as drawn (V2 waited for its iframe the same way)
await fontsReady();
const shell = createApp();
const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();
if (font) shell.measure = canvasMeasure(font);
const root = document.getElementById('root')!;
createRoot(root).render(<App shell={shell} />);
root.dataset.ready = 'true';
// for tests and debugging in the browser console (read-only use)
(window as unknown as { archflow: unknown }).archflow = shell;
