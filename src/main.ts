// V3 entry point. Modules are added step by step (docs/v3-progress.md, stage 3).
import './styles/tokens.css';
import './styles/base.css';
import './styles/canvas.css';
import { APP_VERSION } from './version';
import { initLocale, onLocaleChange, t } from './core/i18n';

const root = document.getElementById('root');
function paint(): void {
  if (!root) return;
  root.textContent = `${t('app.name')} — ${t('app.version', { version: APP_VERSION })}`;
  root.dataset.ready = 'true';
}
initLocale();
onLocaleChange(paint);
paint();
