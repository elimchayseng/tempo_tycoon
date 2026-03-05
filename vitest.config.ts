import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['agents/**/*.ts', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', '**/types.ts'],
    },
  },
});
