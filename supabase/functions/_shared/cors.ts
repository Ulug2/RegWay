export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

// For jobs only the timers (and the owner) may run: anything but the
// service key is refused. The public key is in every browser, so a job that
// accepts it can be run by anyone on the internet, as often as they like.
export function requireServiceKey(req: Request): Response | null {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  return token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? null : json({ error: 'Service key required' }, 401)
}
