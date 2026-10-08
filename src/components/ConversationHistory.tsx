import { useEffect, useState } from 'react'
import { useCachedState } from '../lib/useCachedState'
import { deleteConversation, fetchConversations, type ConversationSummary } from '../lib/data'
import { MagnifyingGlass, Plus, Trash, X } from './icons'

// The chat's left sidebar: "New chat" and the signed-in user's saved RegWay
// AI conversations, most recent first. Choosing one resumes it. Reloads
// when `refreshKey` changes (after each exchange), so a new conversation
// appears as soon as its first message is answered. The list is kept in the
// cache, so opening the sidebar shows it at once and the reload is silent.

function formatWhen(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Today / Yesterday / Previous 7 days / Older, in that order. The list
// arrives newest first, so each group keeps that order.
const GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const

function groupOf(iso: string): (typeof GROUPS)[number] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.ceil((startOfToday.getTime() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days <= 7 ? 'Previous 7 days' : 'Older'
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
  const [conversations, setConversations] = useCachedState<ConversationSummary[] | null>('conversations', null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const shown = conversations?.filter(c => !needle || c.title.toLowerCase().includes(needle) || c.context?.name.toLowerCase().includes(needle))

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
      style={{ paddingTop: 'var(--chat-top, 0px)', background: 'var(--sidebar)', borderRight: '1px solid rgb(var(--line-rgb) / 0.30)' }}
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
      <div className="px-3 pb-3 relative">
        <MagnifyingGlass size={15} aria-hidden="true" className="absolute left-6 top-[11px] pointer-events-none" style={{ color: 'var(--text-300)' }} />
        <input
          type="search"
          name="conversation-search"
          autoComplete="off"
          aria-label="Search conversations"
          placeholder="Search conversations…"
          className="glass-input-rect"
          style={{ paddingLeft: 34, fontSize: 13 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto scrollable px-3 pb-4 ">
        {error && <div className="text-xs px-1" style={{ color: 'var(--warning)' }}>{error}</div>}
        {conversations === null && !error && (
          <div className="space-y-3 px-1 pt-1" role="status" aria-label="Loading conversations">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-9" />)}
          </div>
        )}
        {conversations?.length === 0 && <div className="text-[13px] px-1" style={{ color: 'var(--text-400)' }}>No saved conversations yet.</div>}
        {!!conversations?.length && shown?.length === 0 && <div className="text-[13px] px-1" style={{ color: 'var(--text-400)' }}>No conversation matches “{search.trim()}”.</div>}
        {GROUPS.map(group => {
          const inGroup = shown?.filter(c => groupOf(c.updated_at) === group) ?? []
          if (inGroup.length === 0) return null
          return (
            <section key={group} aria-label={group} className="mb-4">
              <h3 className="text-xs font-medium px-3 pb-1.5" style={{ color: 'var(--text-300)' }}>{group}</h3>
              <div className="space-y-0.5">
        {inGroup.map(c => (

          <div key={c.id} className="group relative">
            <button
              onClick={() => onResume(c)}
              disabled={disabled}
              className="w-full text-left px-3 py-2 rounded-lg transition-colors hover:bg-sky-50 disabled:cursor-not-allowed"
              aria-current={c.id === activeId ? 'true' : undefined}
              style={{ background: c.id === activeId ? 'var(--hover-tint)' : undefined }}
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
            </section>
          )
        })}
      </div>
    </aside>
  )
}
