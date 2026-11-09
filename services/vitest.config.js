import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['*/test/**/*.test.js'],
    setupFiles: ['./test-setup.js'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: { provider: 'v8', include: ['*/src/**/*.js'], exclude: ['**/index.js', '**/seed-admin.js', 'shared/src/cloud.js', 'shared/src/cleanup.js'], reporter: ['text-summary', 'text'] },
  },
});
