import { useEffect, useState } from 'react'
import { deleteConversation, fetchConversations, type ConversationSummary } from '../lib/data'

// The chat's left sidebar: "New chat" and the signed-in user's saved RegWay
// AI conversations, most recent first. Choosing one resumes it. Reloads
// when `refreshKey` changes (after each exchange), so a new conversation
// appears as soon as its first message is answered.

function formatWhen(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ConversationHistory({
  activeId,
  refreshKey,
  disabled,
  onResume,
  onNewChat,
  onClose,
}: {
  activeId: string
  refreshKey: number
  disabled: boolean
  onResume: (conversation: ConversationSummary) => void
  onNewChat: () => void
  onClose: () => void
}) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    fetchConversations()
      .then(list => current && setConversations(list))
      .catch(err => current && setError(err instanceof Error ? err.message : 'Could not load conversations'))
    return () => {
      current = false
    }
  }, [refreshKey])

  const remove = async (id: string) => {
    try {
      await deleteConversation(id)
      setConversations(list => list?.filter(c => c.id !== id) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    }
  }

  return (
    <aside
      aria-label="Chats"
      className="absolute md:static inset-y-0 left-0 z-20 w-72 md:w-64 flex flex-col flex-shrink-0"
      style={{ background: 'rgb(var(--canvas-rgb) / 0.98)', borderRight: '1px solid rgb(var(--line-rgb) / 0.30)' }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          onClick={onNewChat}
          disabled={disabled}
          className="flex-1 px-4 py-2 text-xs font-medium rounded-full transition-all disabled:opacity-50"
          style={{ background: 'rgb(var(--primary-rgb) / 0.08)', color: 'var(--primary)', border: '1px solid rgb(var(--primary-rgb) / 0.20)' }}
        >
          New chat
        </button>
        <button onClick={onClose} aria-label="Hide chats" className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100" style={{ color: 'var(--text-300)' }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-400)' }}>Past conversations</div>
      <div className="flex-1 overflow-y-auto scrollable px-3 pb-4 space-y-1.5">
        {error && <div className="text-xs px-1" style={{ color: 'var(--warning)' }}>{error}</div>}
        {conversations === null && !error && <div className="text-xs px-1" style={{ color: 'var(--text-300)' }}>Loading…</div>}
        {conversations?.length === 0 && <div className="text-xs px-1" style={{ color: 'var(--text-300)' }}>No saved conversations yet.</div>}
        {conversations?.map(c => (
          <div key={c.id} className="group relative">
            <button
              onClick={() => onResume(c)}
              disabled={disabled}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-sky-50 disabled:cursor-not-allowed"
              style={{ background: c.id === activeId ? 'rgb(var(--primary-rgb) / 0.08)' : undefined }}
            >
              <div className="text-sm font-medium pr-6 truncate" style={{ color: 'var(--text-900)' }}>{c.title}</div>
              <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-400)' }}>
                {formatWhen(c.updated_at)}
                {c.context ? ` · about ${c.context.name}` : ''}
              </div>
            </button>
            <button
              onClick={() => remove(c.id)}
              aria-label="Delete conversation"
              title="Delete conversation"
              className="absolute top-2.5 right-2 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-sky-100"
              style={{ color: 'var(--text-300)' }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
