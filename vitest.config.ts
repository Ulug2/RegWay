import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests cover the pure logic in src/lib and in the edge functions'
// shared modules (supabase/functions/_shared). The functions are written for
// Deno and import supabase-js as `npm:@supabase/supabase-js@<version>`; here
// that import resolves to a fake client, so no test can reach a real project.
// tests/unit/functionImports.test.ts keeps the version in step with the app's.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'npm:@supabase/supabase-js@2.116.0': path.resolve(__dirname, './tests/unit/helpers/fakeSupabase.ts'),
      // The real PDF reader (package.json pins the same version).
      'npm:unpdf@2.1.0': 'unpdf',
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Fake values, so the suite neither needs a .env.local nor reads a real
    // project's address from one.
    env: { VITE_SUPABASE_URL: 'http://localhost:54399', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    setupFiles: ['tests/unit/helpers/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
