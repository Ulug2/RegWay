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

// Like callFunction, but for an endpoint that streams back an SSE response
// (text/event-stream) instead of one JSON blob — returns the raw Response so
// the caller can read `response.body` incrementally. A non-OK response here
// is still ordinary JSON (the function's error path doesn't stream), so it's
// parsed the same way callFunction does.
export async function streamFunction(name: string, body: unknown = {}, signal?: AbortSignal): Promise<Response> {
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
    signal,
  })

  if (!res.ok) {
    const errJson = await res.json().catch(() => null)
    throw new Error(errJson?.error || `${name} failed with status ${res.status}`)
  }
  return res
}
