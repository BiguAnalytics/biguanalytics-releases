import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/main/modules/__tests__/**/*.test.js',
      'src/renderer/**/*.test.js',
    ],
    environment: 'node',
    globals: true,
    fileParallelism: false,
  },
});
