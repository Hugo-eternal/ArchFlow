import { defineConfig } from 'vitest/config';

// V3 tests: src/ modules, golden comparisons and the built dist/ArchFlow.html. Tests that only
// describe V2.10.1 (the reference the goldens were recorded from) are in tests/legacy and run
// with `npm run test:legacy` (vitest.legacy.config.js).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,ts}', 'tests/golden/**/*.test.{js,ts}'],
    environment: 'node',
    testTimeout: 30000,
    // process CSS so `?raw` imports (export/ reads canvas.css and tokens.css) return the file text
    css: true,
  },
});
