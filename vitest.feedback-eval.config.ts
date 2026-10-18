import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/chat/feedback.eval.ts'],
    fileParallelism: false,
    hookTimeout: 35_000,
    retry: 0,
  },
});
