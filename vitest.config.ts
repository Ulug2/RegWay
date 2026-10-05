import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests cover the pure logic in src/lib and in the edge functions'
// shared modules (supabase/functions/_shared). The functions are written for
// Deno and import supabase-js by URL; here that import resolves to a fake
// client, so no test can reach a real project.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'https://esm.sh/@supabase/supabase-js@2.45.4': path.resolve(__dirname, './tests/unit/helpers/fakeSupabase.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/helpers/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
