import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,ts}', 'tests/golden/**/*.test.{js,ts}'],
    environment: 'node',
    testTimeout: 30000,
    // process CSS so `?raw` imports (export/ reads canvas.css and tokens.css) return the file text
    css: true,
  },
});
