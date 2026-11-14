import { useEffect, useRef, useState } from 'react'
import { useCachedState } from '../lib/useCachedState'
import {
  CONVERSATION_TITLE_MAX,
  conversationTitle,
  deleteConversation,
  fetchArchivedConversations,
  fetchConversations,
  renameConversation,
  setConversationArchived,
  setConversationPinned,
  type ConversationSummary,
} from '../lib/data'
import { Archive, DotsThree, MagnifyingGlass, PencilSimple, Plus, PushPin, Trash, X } from './icons'

// The chat's left sidebar: "New chat" and the signed-in user's saved RegWay
// AI conversations. Pinned ones sit above the date groups. Choosing one
// resumes it. Reloads when `refreshKey` changes (after each exchange), so a
// new conversation appears as soon as its first message is answered. The
// list is kept in the cache, so opening the sidebar shows it at once and
// the reload is silent.

function formatWhen(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Today / Yesterday / Previous 7 days / Older, in that order. The list
// arrives newest first, so each group keeps that order. Pinned chats are
// not put in these groups.
const GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const

function groupOf(iso: string): (typeof GROUPS)[number] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.ceil((startOfToday.getTime() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days <= 7 ? 'Previous 7 days' : 'Older'
}

const matchesSearch = (c: ConversationSummary, needle: string) =>
  !needle || c.title.toLowerCase().includes(needle) || c.context?.name.toLowerCase().includes(needle)

function MenuItem({ label, icon: Icon, onClick }: { label: string; icon: typeof PencilSimple; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] hover:bg-[var(--hover-tint)]"
      style={{ color: 'var(--text-900)' }}
    >
      <Icon size={15} aria-hidden="true" />
      {label}
    </button>
  )
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
  const [archived, setArchived] = useState<ConversationSummary[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [menuBox, setMenuBox] = useState<{ top: number; left: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const renaming = useRef(false)
  const skipBlur = useRef(false)
  const needle = search.trim().toLowerCase()

  const source = showArchived ? archived : conversations
  const shown = source?.filter(c => matchesSearch(c, needle))
  const pinned = (shown ?? []).filter(c => c.pinned_at && !showArchived).sort((a, b) => (b.pinned_at ?? '').localeCompare(a.pinned_at ?? ''))
  // Date groups follow the last message, not the order a pin left behind.
  const unpinned = (shown ?? [])
    .filter(c => showArchived || !c.pinned_at)
    .sort((a, b) => (showArchived ? (b.archived_at ?? '').localeCompare(a.archived_at ?? '') : b.updated_at.localeCompare(a.updated_at)))
  const menuConversation = source?.find(c => c.id === menuFor) ?? null

  useEffect(() => {
    let current = true
    fetchConversations()
      .then(list => current && setConversations(list))
      .catch(err => current && setError(err instanceof Error ? err.message : 'Could not load conversations'))
    return () => {
      current = false
    }
  }, [refreshKey, setConversations])

  useEffect(() => {
    if (!menuFor || !menuButtonRef.current) return
    const button = menuButtonRef.current
    const place = () => {
      const rect = button.getBoundingClientRect()
      // The chat panel is transformed, so a fixed menu is positioned against
      // that panel, not the viewport. Subtract its origin.
      let originTop = 0
      let originLeft = 0
      let current: HTMLElement | null = button
      while (current) {
        if (getComputedStyle(current).transform !== 'none') {
          const origin = current.getBoundingClientRect()
          originTop = origin.top
          originLeft = origin.left
          break
        }
        current = current.parentElement
      }
      const width = 188
      const height = 176
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) - originLeft
      const below = rect.bottom + 4
      const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below
      setMenuBox({ top: top - originTop, left })
    }
    place()
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (button.contains(target) || menuRef.current?.contains(target)) return
      setMenuFor(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [menuFor])

  const replaceIn = (list: ConversationSummary[] | null, id: string, patch: Partial<ConversationSummary>) =>
    list?.map(c => (c.id === id ? { ...c, ...patch } : c)) ?? null

  const dropFrom = (list: ConversationSummary[] | null, id: string) => list?.filter(c => c.id !== id) ?? null

  const fail = (err: unknown, fallback: string) => setError(err instanceof Error ? err.message : fallback)

  const remove = async (id: string) => {
    setMenuFor(null)
    try {
      await deleteConversation(id)
      setConversations(list => dropFrom(list, id))
      setArchived(list => dropFrom(list, id))
    } catch (err) {
      fail(err, 'Could not delete')
    }
  }

  const startRename = (c: ConversationSummary) => {
    setMenuFor(null)
    setError(null)
    setEditingId(c.id)
    setDraft(c.title)
  }

  const cancelRename = () => {
    skipBlur.current = true
    setEditingId(null)
    setError(null)
  }

  const commitRename = async (c: ConversationSummary) => {
    if (renaming.current) return
    let next: string
    try {
      next = conversationTitle(draft)
    } catch (err) {
      fail(err, 'Enter a title.')
      return
    }
    if (next === c.title) {
      skipBlur.current = true
      setEditingId(null)
      setError(null)
      return
    }
    renaming.current = true
    try {
      const saved = await renameConversation(c.id, next)
      setConversations(list => replaceIn(list, c.id, { title: saved }))
      setArchived(list => replaceIn(list, c.id, { title: saved }))
      skipBlur.current = true
      setEditingId(null)
      setError(null)
    } catch (err) {
      fail(err, 'Could not rename')
    } finally {
      renaming.current = false
    }
  }

  const pin = async (c: ConversationSummary) => {
    setMenuFor(null)
    try {
      const pinned_at = await setConversationPinned(c.id, !c.pinned_at)
      setConversations(list => replaceIn(list, c.id, { pinned_at }))
      setArchived(list => replaceIn(list, c.id, { pinned_at }))
    } catch (err) {
      fail(err, 'Could not update pin')
    }
  }

  const archive = async (c: ConversationSummary) => {
    setMenuFor(null)
    const next = !c.archived_at
    try {
      const archived_at = await setConversationArchived(c.id, next)
      if (next) {
        setConversations(list => dropFrom(list, c.id))
        setArchived(list => (list ? [{ ...c, archived_at }, ...list.filter(item => item.id !== c.id)] : list))
      } else {
        setArchived(list => dropFrom(list, c.id))
        setConversations(await fetchConversations())
      }
    } catch (err) {
      fail(err, next ? 'Could not archive' : 'Could not unarchive')
    }
  }

  const openArchived = () => {
    setShowArchived(true)
    setMenuFor(null)
    setEditingId(null)
    setError(null)
    setArchived(null)
    fetchArchivedConversations()
      .then(setArchived)
      .catch(err => fail(err, 'Could not load archived conversations'))
  }

  const row = (c: ConversationSummary) => {
    const editing = editingId === c.id
    return (
      <div key={c.id} className="group relative">
        {editing ? (
          <form
            className="px-2 py-1.5"
            onSubmit={event => {
              event.preventDefault()
              void commitRename(c)
            }}
          >
            <input
              aria-label="Conversation title"
              className="glass-input-rect w-full"
              style={{ fontSize: 13, padding: '6px 10px' }}
              value={draft}
              maxLength={CONVERSATION_TITLE_MAX}
              autoFocus
              onFocus={event => event.currentTarget.select()}
              onChange={event => setDraft(event.target.value)}
              onBlur={() => {
                if (skipBlur.current) {
                  skipBlur.current = false
                  return
                }
                void commitRename(c)
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelRename()
                }
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onResume(c)}
            disabled={disabled}
            className="w-full text-left pl-3 pr-10 py-2 rounded-lg transition-colors hover:bg-sky-50 disabled:cursor-not-allowed"
            aria-current={c.id === activeId ? 'true' : undefined}
            style={{ background: c.id === activeId ? 'var(--hover-tint)' : undefined }}
          >
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-900)' }}>{c.title}</div>
            <div className="text-xs mt-0.5 truncate num" style={{ color: 'var(--text-400)' }}>
              {formatWhen(c.updated_at)}
              {c.context ? ` · about ${c.context.name}` : ''}
            </div>
          </button>
        )}
        {!editing && (
          <button
            type="button"
            ref={menuFor === c.id ? menuButtonRef : undefined}
            onClick={() => setMenuFor(open => (open === c.id ? null : c.id))}
            aria-label="Conversation actions"
            aria-haspopup="menu"
            aria-expanded={menuFor === c.id}
            title="Conversation actions"
            className="btn-icon absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100"
            style={{ width: 28, height: 28, opacity: menuFor === c.id ? 1 : undefined }}
          >
            <DotsThree size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  const listBody = () => {
    if (source === null && !error) {
      return (
        <div className="space-y-3 px-1 pt-1" role="status" aria-label="Loading conversations">
          {[0, 1, 2].map(i => <div key={i} className="skeleton h-9" />)}
        </div>
      )
    }
    if (!showArchived && conversations?.length === 0) {
      return <div className="text-[13px] px-1" style={{ color: 'var(--text-400)' }}>No saved conversations yet.</div>
    }
    if (showArchived && archived?.length === 0) {
      return <div className="text-[13px] px-1" style={{ color: 'var(--text-400)' }}>No archived conversations.</div>
    }
    if (!!source?.length && shown?.length === 0) {
      return <div className="text-[13px] px-1" style={{ color: 'var(--text-400)' }}>No conversation matches “{search.trim()}”.</div>
    }
    if (showArchived) {
      return (
        <section aria-label="Archived" className="mb-4">
          <h3 className="text-xs font-medium px-3 pb-1.5" style={{ color: 'var(--text-300)' }}>Archived</h3>
          <div className="space-y-0.5">{unpinned.map(row)}</div>
        </section>
      )
    }
    return (
      <>
        {pinned.length > 0 && (
          <section aria-label="Pinned" className="mb-4">
            <h3 className="text-xs font-medium px-3 pb-1.5" style={{ color: 'var(--text-300)' }}>Pinned</h3>
            <div className="space-y-0.5">{pinned.map(row)}</div>
          </section>
        )}
        {GROUPS.map(group => {
          const inGroup = unpinned.filter(c => groupOf(c.updated_at) === group)
          if (inGroup.length === 0) return null
          return (
            <section key={group} aria-label={group} className="mb-4">
              <h3 className="text-xs font-medium px-3 pb-1.5" style={{ color: 'var(--text-300)' }}>{group}</h3>
              <div className="space-y-0.5">{inGroup.map(row)}</div>
            </section>
          )
        })}
      </>
    )
  }

  return (
    <aside
      aria-label="Chats"
      className="absolute md:static inset-y-0 left-0 z-20 w-full sm:w-72 md:w-64 flex flex-col flex-shrink-0"
      style={{ paddingTop: 'var(--chat-top, 0px)', background: 'var(--sidebar)', borderRight: '1px solid rgb(var(--line-rgb) / 0.30)' }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={onNewChat} disabled={disabled} className="btn-tool is-accent flex-1">
          <Plus size={15} weight="bold" aria-hidden="true" />
          New chat
        </button>
        <button type="button" onClick={onClose} aria-label="Hide chats" className="btn-icon md:hidden">
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
      <div className="flex-1 overflow-y-auto scrollable px-3 pb-4" onScroll={() => menuFor && setMenuFor(null)}>
        {error && <div role="alert" className="text-xs px-1 mb-2" style={{ color: 'var(--warning)' }}>{error}</div>}
        {listBody()}
      </div>
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.30)' }}>
        {showArchived ? (
          <button type="button" className="link text-[13px]" onClick={() => { setShowArchived(false); setMenuFor(null); setEditingId(null) }}>
            Back to chats
          </button>
        ) : (
          <button type="button" className="link text-[13px]" onClick={openArchived}>
            Archived
          </button>
        )}
      </div>
      {menuFor && menuBox && menuConversation && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Conversation actions"
          className="py-1 px-1"
          style={{
            position: 'fixed',
            top: menuBox.top,
            left: menuBox.left,
            width: 188,
            zIndex: 40,
            background: 'var(--canvas)',
            border: '1px solid rgb(var(--line-rgb) / 0.45)',
            borderRadius: 'var(--r-tile)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <MenuItem label="Rename" icon={PencilSimple} onClick={() => startRename(menuConversation)} />
          <MenuItem label={menuConversation.pinned_at ? 'Unpin' : 'Pin'} icon={PushPin} onClick={() => void pin(menuConversation)} />
          <MenuItem label={menuConversation.archived_at ? 'Unarchive' : 'Archive'} icon={Archive} onClick={() => void archive(menuConversation)} />
          <MenuItem label="Delete" icon={Trash} onClick={() => void remove(menuConversation.id)} />
        </div>
      )}
    </aside>
  )
}
