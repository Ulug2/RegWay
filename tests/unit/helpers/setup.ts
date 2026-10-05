// The edge functions read their configuration from Deno.env. Fixed fake
// values here: nothing in a unit test talks to a real service.
export const SERVICE_KEY = 'test-service-key'

const env: Record<string, string> = {
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ANTHROPIC_API_KEY: 'test-anthropic-key',
}

;(globalThis as Record<string, unknown>).Deno = {
  env: { get: (name: string) => env[name] },
  serve: () => {},
}
