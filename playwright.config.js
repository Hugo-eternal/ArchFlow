// V3 E2E against dist/ArchFlow.html (npm run build first), on the preinstalled Chromium. Run with:
// npm run test:e2e (adds --trace off). V2.10.1 E2E: playwright.legacy.config.js.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  reporter: 'list',
  use: { trace: 'off', viewport: { width: 1500, height: 950 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 950 } } }],
});
