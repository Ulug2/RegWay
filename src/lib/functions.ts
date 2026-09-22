import { supabase } from './supabase'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// Calls a deployed Supabase Edge Function with the current user's session
// token (falling back to the public anon key when signed out). The
// Anthropic API key never touches the browser — it only lives in the
// function's server-side secrets.
export async function callFunction<T = unknown>(name: string, body: unknown = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `${name} failed with status ${res.status}`)
  return json as T
}
