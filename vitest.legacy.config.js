import { defineConfig } from 'vitest/config';

// V2.10.1 characterisation tests (stage 2): they drive legacy/app.<locale>.html and record the
// golden snapshots in tests/golden/<type>/__snapshots__ that the V3 tests compare against.
export default defineConfig({
  test: {
    include: ['tests/legacy/unit/**/*.test.{js,ts}', 'tests/legacy/golden/**/*.test.{js,ts}'],
    environment: 'node',
    testTimeout: 60000,
  },
});
