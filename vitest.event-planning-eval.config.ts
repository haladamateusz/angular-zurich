import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/chat/event-planning.eval.ts'],
    fileParallelism: false,
    retry: 0,
  },
});
