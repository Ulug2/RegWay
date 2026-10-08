import { useEffect, useState } from 'react'
import { deleteConversation, fetchConversations, type ConversationSummary } from '../lib/data'
import { Plus, Trash, X } from './icons'

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
      style={{ paddingTop: 'var(--chat-top, 0px)', background: 'rgb(var(--canvas-rgb) / 0.98)', borderRight: '1px solid rgb(var(--line-rgb) / 0.30)' }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button onClick={onNewChat} disabled={disabled} className="btn-tool is-accent flex-1">
          <Plus size={15} weight="bold" aria-hidden="true" />
          New chat
        </button>
        <button onClick={onClose} aria-label="Hide chats" className="btn-icon md:hidden">
          <X size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className="section-label px-4 pb-2">Past conversations</div>
      <div className="flex-1 overflow-y-auto scrollable px-3 pb-4 space-y-1.5">
        {error && <div className="text-xs px-1" style={{ color: 'var(--warning)' }}>{error}</div>}
        {conversations === null && !error && (
          <div className="space-y-3 px-1 pt-1" role="status" aria-label="Loading conversations">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-9" />)}
          </div>
        )}
        {conversations?.length === 0 && <div className="text-[13px] px-1" style={{ color: 'var(--text-400)' }}>No saved conversations yet.</div>}
        {conversations?.map(c => (
          <div key={c.id} className="group relative">
            <button
              onClick={() => onResume(c)}
              disabled={disabled}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-sky-50 disabled:cursor-not-allowed"
              style={{ background: c.id === activeId ? 'rgb(var(--primary-rgb) / 0.08)' : undefined }}
            >
              <div className="text-sm font-medium pr-6 truncate" style={{ color: 'var(--text-900)' }}>{c.title}</div>
              <div className="text-xs mt-0.5 truncate num" style={{ color: 'var(--text-400)' }}>
                {formatWhen(c.updated_at)}
                {c.context ? ` · about ${c.context.name}` : ''}
              </div>
            </button>
            <button
              onClick={() => remove(c.id)}
              aria-label="Delete conversation"
              title="Delete conversation"
              className="btn-icon absolute top-2 right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              style={{ width: 28, height: 28 }}
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
