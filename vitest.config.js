import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/main/auth/__tests__/**/*.test.js',
      'src/main/modules/__tests__/**/*.test.js',
      'src/renderer/**/*.test.js',
      'server/__tests__/**/*.test.js',
    ],
    environment: 'node',
    globals: true,
    fileParallelism: false,
  },
});
