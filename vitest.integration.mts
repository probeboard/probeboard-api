import { defineConfig } from 'vitest/config';

/**
 * Integration tests. They need a real PostgreSQL; the unit suite
 * (`vitest.config.mts`) needs nothing and stays fast.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['src/testing/global-setup.ts'],
    // One database, so files must not interleave their truncations.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
