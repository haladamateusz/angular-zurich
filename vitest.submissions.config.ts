import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'npm:@supabase/supabase-js@2': fileURLToPath(
        new URL('./node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url),
      ),
      '@supabase/functions-js/edge-runtime.d.ts': fileURLToPath(
        new URL('./scripts/submissions/edge-runtime-stub.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node', include: ['scripts/submissions/**/*.spec.ts'] },
});
