// A saved conversation: opening (or creating) it, replaying its recent turns
// to the model, and switching what it is focused on.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import type { AiContext } from './prompt.ts'

// How much of a conversation is replayed to the model: the most recent
// turns, capped in size so a long chat doesn't grow every request without
// bound (older turns drop off first).
export const HISTORY_MESSAGES = 20
export const HISTORY_CHARS = 24_000
export const TITLE_CHARS = 80

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export type Refocus = { type: 'firm' } | { type: 'fund' | 'company'; id: string }

// The scope a refocus names, read through the caller's own client so it can
// only be one of their firm's funds or companies (the stored name, not the
// client's). Undefined = the whole firm; null = not found.
export async function resolveRefocus(supabase: SupabaseClient, firmId: string, refocus: Refocus): Promise<AiContext | undefined | null> {
  if (refocus.type === 'firm') return undefined
  if (refocus.type !== 'fund' && refocus.type !== 'company') return null
  const table = refocus.type === 'fund' ? 'funds' : 'portfolio_companies'
  const { data } = await supabase.from(table).select('id, name').eq('id', refocus.id).eq('firm_id', firmId).maybeSingle()
  return data ? { type: refocus.type, id: data.id as string, name: data.name as string } : null
}

export const refocusNote = (context: AiContext | undefined) =>
  `[The user has switched this conversation's focus to ${context ? `the ${context.type === 'fund' ? 'fund' : 'portfolio company'} "${context.name}"` : 'the whole firm'}. Earlier turns may be about something else; answer about the new focus from here on.]\n\n`

// This user's conversation, created on its first message. Null when the id
// is someone else's: RLS hides it from the read, and the insert can't take
// an id that already exists.
export async function openConversation(
  supabase: SupabaseClient,
  id: string,
  firmId: string,
  userId: string,
  firstMessage: string,
  context: AiContext | undefined,
): Promise<{ context: AiContext | null; created: boolean; stoppedAt: string | null } | null> {
  const { data: existing } = await supabase.from('regway_ai_conversations').select('context, stopped_at').eq('id', id).maybeSingle()
  if (existing) return { context: (existing.context as AiContext | null) ?? null, created: false, stoppedAt: (existing.stopped_at as string | null) ?? null }
  const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, TITLE_CHARS) || 'New conversation'
  const { error } = await supabase.from('regway_ai_conversations').insert({ id, firm_id: firmId, user_id: userId, title, context: context ?? null })
  return error ? null : { context: context ?? null, created: true, stoppedAt: null }
}

// The stop button, as the server sees it: the browser stamps the
// conversation's stopped_at (migration 0037), or deletes a conversation the
// stopped message would have started. A closed connection alone does not
// reach the function. Polls while an answer or its check runs; returns the
// function that ends the watch.
export const STOP_POLL_MS = 1500

export function watchForStop(supabase: SupabaseClient, conversationId: string, stoppedAt: string | null, onStop: () => void): () => void {
  let ended = false
  const end = () => {
    ended = true
    clearInterval(timer)
  }
  const timer = setInterval(async () => {
    const { data, error } = await supabase.from('regway_ai_conversations').select('stopped_at').eq('id', conversationId).maybeSingle()
    // A failed read is not a stop.
    if (ended || error) return
    if (!data || ((data.stopped_at as string | null) ?? null) !== stoppedAt) {
      end()
      onStop()
    }
  }, Number(Deno.env.get('CHAT_STOP_POLL_MS')) || STOP_POLL_MS)
  return end
}

export async function loadHistory(supabase: SupabaseClient, conversationId: string): Promise<HistoryTurn[]> {
  const { data } = await supabase
    .from('regway_ai_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_MESSAGES)
  const turns: HistoryTurn[] = []
  let chars = 0
  for (const m of (data ?? []) as HistoryTurn[]) {
    // A stopped reply can be saved empty; the API rejects empty content.
    if (!m.content?.trim()) continue
    if (chars + m.content.length > HISTORY_CHARS) break
    chars += m.content.length
    turns.unshift(m)
  }
  // The conversation sent to the model must start with a user turn.
  while (turns[0]?.role === 'assistant') turns.shift()
  return turns
}

// Earlier turns as API messages, with a cache breakpoint on the last one:
// each new message re-sends the same prefix, so it's billed at the cache
// rate instead of in full.
export function historyMessages(history: HistoryTurn[]) {
  return history.map((turn, i) =>
    i === history.length - 1
      ? { role: turn.role, content: [{ type: 'text', text: turn.content, cache_control: { type: 'ephemeral' } }] }
      : { role: turn.role, content: turn.content },
  )
}
