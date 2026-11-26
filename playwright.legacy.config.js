// V2.10.1 E2E (stage 2, index.html + the V2 shell). Run with: npm run test:legacy:e2e.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/legacy/e2e',
  timeout: 60000,
  fullyParallel: false,
  reporter: 'list',
  use: { trace: 'off', viewport: { width: 1500, height: 950 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 950 } } }],
});
