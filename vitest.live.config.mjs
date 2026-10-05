// Live runs in After Effects and Premiere (node tools/panel/live.mjs); never part of npm test.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/live/**/*.live.mjs'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 3600000,
  },
});
