// V3 entry point. Step 3.1 only proves the build pipeline; modules are added from step 3.3 on.
import { APP_NAME, APP_VERSION } from './version';

const root = document.getElementById('root');
if (root) {
  root.textContent = `${APP_NAME} ${APP_VERSION}`;
  root.dataset.ready = 'true';
}
