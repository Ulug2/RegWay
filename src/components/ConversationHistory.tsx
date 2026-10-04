import { useEffect, useState } from 'react'
import { deleteConversation, fetchConversations, type ConversationSummary } from '../lib/data'

// The signed-in user's saved RegWay AI conversations, most recent first.
// Opens over the chat; choosing one resumes it.

function formatWhen(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ConversationHistory({
  activeId,
  onResume,
  onClose,
}: {
  activeId: string
  onResume: (conversation: ConversationSummary) => void
  onClose: () => void
}) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load conversations'))
  }, [])

  const remove = async (id: string) => {
    try {
      await deleteConversation(id)
      setConversations(list => list?.filter(c => c.id !== id) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: 'rgba(253,251,247,0.97)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(186,230,253,0.30)' }}>
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Past conversations</div>
        <button className="text-xs underline" style={{ color: '#0284C7' }} onClick={onClose}>Back to chat</button>
      </div>
      <div className="flex-1 overflow-y-auto scrollable px-6 py-4 space-y-2">
        {error && <div className="text-xs" style={{ color: '#B45309' }}>{error}</div>}
        {conversations === null && !error && <div className="text-xs" style={{ color: '#94a3b8' }}>Loading…</div>}
        {conversations?.length === 0 && <div className="text-xs" style={{ color: '#94a3b8' }}>No saved conversations yet.</div>}
        {conversations?.map(c => (
          <div key={c.id} className="group relative">
            <button
              onClick={() => onResume(c)}
              className="w-full text-left p-3 rounded-xl transition-colors hover:bg-sky-50"
              style={{
                background: c.id === activeId ? 'rgba(2,132,199,0.08)' : 'rgba(255,255,255,0.70)',
                border: '1px solid rgba(186,230,253,0.35)',
              }}
            >
              <div className="text-sm font-medium pr-8 truncate" style={{ color: '#0F172A' }}>{c.title}</div>
              <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                {formatWhen(c.updated_at)}
                {c.context ? ` · about ${c.context.name}` : ''}
              </div>
            </button>
            <button
              onClick={() => remove(c.id)}
              aria-label="Delete conversation"
              title="Delete conversation"
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-sky-100"
              style={{ color: '#94a3b8' }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
