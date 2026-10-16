// The edge functions read their configuration from Deno.env. Fixed fake
// values here: nothing in a unit test talks to a real service.
export const SERVICE_KEY = 'test-service-key'

const env: Record<string, string> = {
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  // No real wait before the AI client's one retry (_shared/ai/client.ts).
  AI_RETRY_DELAY_MS: '0',
}

;(globalThis as Record<string, unknown>).__testEnv = env
;(globalThis as Record<string, unknown>).Deno = {
  env: { get: (name: string) => ((globalThis as Record<string, unknown>).__testEnv as Record<string, string>)[name] },
  serve: () => {},
}

// Sets (or, with undefined, removes) one setting for the test that calls it;
// undo it in an afterEach.
export function setEnv(name: string, value: string | undefined): void {
  const current = (globalThis as Record<string, unknown>).__testEnv as Record<string, string>
  if (value === undefined) delete current[name]
  else current[name] = value
}
