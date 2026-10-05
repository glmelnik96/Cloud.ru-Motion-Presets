import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  define: {
    __CRBK_VERSION__: JSON.stringify('0.0.0-test'),
    __CRBK_BUILD__: JSON.stringify('test'),
    __CRBK_DEV__: 'true',
  },
  test: {
    include: ['tests/**/*.test.mjs', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
