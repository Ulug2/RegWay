import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { streamFunction } from '../lib/functions'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFunds, fetchPortfolioCompanies, fetchConversationMessages, discardEmptyConversation, type ConversationSummary } from '../lib/data'
import ConversationHistory from './ConversationHistory'
import SessionContext, { type Focus } from './SessionContext'
import { renderMarkdown } from '../lib/markdown'
import type { Firm, Fund, PortfolioCompany, AiContext } from '../lib/types'
import { ArrowDown, ArrowUpRight, Check, Copy, PaperPlaneRight, Paperclip, SidebarSimple, Stop, X } from './icons'

interface RegWayAICopilotProps {
  onClose: () => void
  context?: AiContext | null
}

interface Citation {
  url?: string
  title?: string
}

interface Message {
  role: 'user' | 'ai'
  content: string
  citations?: Citation[]
  attachmentName?: string
  status?: string
}

// Suggested first questions, about whatever the chat is focused on.
function suggestedQuestions(context?: AiContext | null): string[] {
  if (context?.type === 'regulation') return ['Summarize this in plain language', 'Who does this apply to?', 'What are the key dates and deadlines?']
  if (context) return [`Summarize what's new for ${context.name}`, `What deadlines are coming up for ${context.name}?`, `Which developments matter most for ${context.name}?`]
  return ["Summarize today's regulatory changes", 'What deadlines are coming up for my funds?', 'Any new state-level rules affecting my portfolio companies?']
}

function welcomeMessage(context?: AiContext | null): Message {
  if (context?.type === 'regulation') {
    return { role: 'ai', content: `Ask me anything about "${context.name}". I'll search live sources and cite what I find.` }
  }
  if (context?.type === 'fund' || context?.type === 'company') {
    return { role: 'ai', content: `Ask me anything about ${context.name}'s regulatory exposure. I'll search live sources and cite what I find.` }
  }
  return { role: 'ai', content: "Ask me anything about your firm's regulatory exposure. I'll search live sources and cite what I find." }
}

// The same limits regway-ai-chat enforces: input is billed by size, so a
// very large file would make one message unusually expensive.
const MAX_PDF_BYTES = 5 * 1024 * 1024
const MAX_TEXT_BYTES = 150 * 1024

// How tall the chat input is allowed to auto-grow before it scrolls
// internally instead of pushing the rest of the drawer around.
const MAX_INPUT_HEIGHT = 240


// Shown in the empty AI bubble while waiting for the first token — cycles
// every couple of seconds so a slow web-search phase (the model's tool-use
// round-trip before any text arrives) doesn't look stalled.
// One word — the wobbling dots next to it already carry the "…" meaning.
const STATUS_PHRASES = ['Diligencing', 'Underwriting', 'Benchmarking', 'Sourcing', 'Structuring', 'Modeling', 'Auditing', 'Researching']
const pickStatusPhrase = (exclude?: string) => {
  const options = exclude ? STATUS_PHRASES.filter(p => p !== exclude) : STATUS_PHRASES
  return options[Math.floor(Math.random() * options.length)]
}

// Decoupled from network timing: the stream can deliver text in uneven
// bursts, but the display reveals it at a steady, readable pace.
const REVEAL_INTERVAL_MS = 16
const REVEAL_CHARS_PER_TICK = 2
const STATUS_CYCLE_MS = 1800

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// Inserts a blinking cursor right before the final closing tag of a
// markdown-rendered HTML string, so it sits at the true visual end of the
// text rather than on its own line after a block element. Safe here only
// because we fully control what renderMarkdown produces.
function withCursor(html: string): string {
  const cursor = '<span class="cursor-blink"></span>'
  const idx = html.lastIndexOf('</')
  return idx === -1 ? html + cursor : html.slice(0, idx) + cursor + html.slice(idx)
}

interface SseEvent {
  type: string
  content_block?: { type: string }
  delta?: { type: string; text?: string; citation?: Citation; stop_reason?: string }
}

// Reads one SSE stream, calling onEvent for each parsed `data: {...}` line.
// A line split across two network chunks is held in `buffer` until complete.
async function consumeSse(body: ReadableStream<Uint8Array>, onEvent: (evt: SseEvent) => void): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        onEvent(JSON.parse(line.slice(6)))
      } catch {
        // Partial/non-JSON SSE line — skip.
      }
    }
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity flex items-center gap-1 text-xs mt-2 hover:text-[var(--text-900)]"
      style={{ color: 'var(--text-400)' }}
      title="Copy message"
    >
      {copied ? (
        <>
          <Check size={12} weight="bold" aria-hidden="true" style={{ color: 'var(--primary)' }} />
          <span style={{ color: 'var(--primary)' }}>Copied</span>
        </>
      ) : (
        <>
          <Copy size={13} aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  )
}

export default function RegWayAICopilot({ onClose, context }: RegWayAICopilotProps) {
  const [messages, setMessages] = useState<Message[]>(() => [welcomeMessage(context)])
  // Each chat is a saved conversation: the id is made here and the server
  // creates the row on the first message. A resumed conversation keeps the
  // scope it started with, whatever page the drawer was opened from.
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID())
  const [activeContext, setActiveContext] = useState<AiContext | null | undefined>(context)
  const [chatsOpen, setChatsOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(true)
  // Set when the user switches focus in a chat that already has messages:
  // sent with the next message so the server updates the conversation's
  // scope and tells the model. Cleared once a message carrying it is sent.
  const [pendingRefocus, setPendingRefocus] = useState<Focus | null>(null)
  // Bumped after each exchange so the chats list picks up a new or
  // re-titled conversation.
  const [savedVersion, setSavedVersion] = useState(0)
  // Whether this conversation has an exchange saved on the server (false for
  // a new chat until its first answer finishes).
  const savedExchangeRef = useRef(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(68)
  useLayoutEffect(() => {
    if (headerRef.current) setHeaderH(headerRef.current.offsetHeight)
  }, [hasStarted])
  const [visible, setVisible] = useState(false)
  const [firm, setFirm] = useState<Firm | null>(null)
  const [funds, setFunds] = useState<Fund[]>([])
  const [companies, setCompanies] = useState<PortfolioCompany[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Set for exactly one tick when the user sends a message — forces the
  // scroll to bottom unconditionally that once (their own new message plus
  // the AI placeholder can grow the content past the normal "near bottom"
  // threshold even if they were sitting right at the bottom a moment ago).
  const forceScrollRef = useRef(false)
  // True once the user has manually scrolled during the current response —
  // stays true (auto-follow stays off) for the rest of that message, reset
  // only when a new message starts or they click "scroll to latest". Set
  // only from real input events (wheel/touch), never from the generic
  // 'scroll' event, since our own programmatic scrollTop assignment fires
  // that same event and would otherwise immediately re-disable itself.
  const userScrolledAwayRef = useRef(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  // Timers for the active response, so the stop button can kill them
  // directly rather than hoping the abort propagates through the stream
  // read loop in time.
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setTimeout(() => setVisible(true), 30)
  }, [])

  // Auto-grow the chat textarea as the user types past one line, capping
  // at MAX_INPUT_HEIGHT and letting it scroll internally beyond that.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
    // Once capped, the browser's native "scroll caret into view" only
    // reveals the caret's line, not the padding below it — leaving the
    // line being typed flush against the bottom edge. Scrolling fully to
    // the bottom keeps that padding visible beneath the last line.
    el.scrollTop = el.scrollHeight
  }, [input])

  useEffect(() => {
    getFirmId().then(async id => {
      if (!id) return
      const [{ data: firmRow }, fundRows, companyRows] = await Promise.all([
        supabase.from('firms').select('*').eq('id', id).single(),
        fetchFunds(id),
        fetchPortfolioCompanies(id),
      ])
      if (firmRow) setFirm(firmRow)
      setFunds(fundRows)
      setCompanies(companyRows)
    })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (forceScrollRef.current) {
      forceScrollRef.current = false
      userScrolledAwayRef.current = false
      el.scrollTop = el.scrollHeight
      return
    }
    // Once the user has taken manual control (see onWheel/onTouchMove
    // below), auto-follow stays off for the rest of this message — no
    // distance threshold to fight with, which is what let small manual
    // scrolls get silently overridden before.
    if (userScrolledAwayRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // Real user-initiated scroll intent. Deliberately not the generic 'scroll'
  // event: that fires identically for our own programmatic `el.scrollTop =
  // ...` assignment above, which would otherwise immediately flip this back
  // off right after we set it.
  const handleUserScrollIntent = () => {
    userScrolledAwayRef.current = true
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollButton(distanceFromBottom >= 80)
  }

  const scrollToBottom = () => {
    userScrolledAwayRef.current = false
    setShowScrollButton(false)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const isSupported = /\.(txt|md|pdf)$/i.test(file.name)
    if (!isSupported) {
      setAttachError('Only .txt, .md, or .pdf files are supported')
      return
    }
    const isPdf = /\.pdf$/i.test(file.name)
    if (file.size > (isPdf ? MAX_PDF_BYTES : MAX_TEXT_BYTES)) {
      setAttachError(isPdf ? 'PDF must be under 5 MB' : 'Text file must be under 150 KB')
      return
    }
    setAttachError(null)
    setPendingFile(file)
  }

  const sendMessage = async (text: string) => {
    const file = pendingFile
    if ((!text.trim() && !file) || isTyping) return

    forceScrollRef.current = true
    setShowScrollButton(false)
    setHasStarted(true)
    const userMsg: Message = { role: 'user', content: text, attachmentName: file?.name }
    setMessages(m => [...m, userMsg, { role: 'ai', content: '', status: pickStatusPhrase() }])
    setInput('')
    setPendingFile(null)
    setIsTyping(true)

    const controller = new AbortController()
    abortRef.current = controller

    let target = ''
    let revealed = 0
    let streamDone = false
    let answered = false
    // The model writes a sentence, runs a search, then carries on in a new
    // block of text that doesn't start with a space.
    let afterTool = false
    const citations: Citation[] = []

    const statusTimer = setInterval(() => {
      setMessages(m => {
        const last = m[m.length - 1]
        if (last.role !== 'ai' || last.content !== '') return m
        const copy = [...m]
        copy[copy.length - 1] = { ...last, status: pickStatusPhrase(last.status) }
        return copy
      })
    }, STATUS_CYCLE_MS)
    statusTimerRef.current = statusTimer

    // Paced by the clock, not by ticks: browsers slow timers in a tab that
    // isn't in front (to about one a second), which made an answer take
    // minutes to appear and kept the chat locked meanwhile.
    let lastReveal = performance.now()
    const revealTimer = setInterval(() => {
      const now = performance.now()
      const due = Math.max(1, Math.round((now - lastReveal) / REVEAL_INTERVAL_MS)) * REVEAL_CHARS_PER_TICK
      lastReveal = now
      if (revealed >= target.length) {
        if (streamDone) {
          clearInterval(revealTimer)
          // Only the call that's still "current" flips isTyping off / frees
          // abortRef — a stale reveal finishing after the user already
          // stopped generation or started a newer message must not clobber
          // that newer state.
          if (abortRef.current === controller) {
            setIsTyping(false)
            abortRef.current = null
          }
        }
        return
      }
      revealed = Math.min(target.length, revealed + due)
      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'ai', content: target.slice(0, revealed), citations: [...citations] }
        return copy
      })
    }, REVEAL_INTERVAL_MS)
    revealTimerRef.current = revealTimer

    try {
      let attachment: { name: string; mimeType: string; content?: string; base64Data?: string } | undefined
      if (file) {
        attachment = /\.pdf$/i.test(file.name)
          ? { name: file.name, mimeType: 'application/pdf', base64Data: await fileToBase64(file) }
          : { name: file.name, mimeType: file.type || 'text/plain', content: await file.text() }
      }

      const res = await streamFunction('regway-ai-chat', { message: text, attachment, context: activeContext, conversationId, refocus: pendingRefocus ?? undefined }, controller.signal)
      if (!res.body) throw new Error('No response stream')
      setPendingRefocus(null)

      await consumeSse(res.body, evt => {
        // Surfaced honestly rather than just silently cutting off — the
        // reader should know the model ran out of room, not wonder if
        // something broke.
        if (evt.type === 'message_delta' && evt.delta?.stop_reason === 'max_tokens') {
          target += '\n\n*(Response cut off: it reached the length limit. Ask me to continue for more.)*'
          return
        }
        if (evt.type === 'content_block_start' && evt.content_block && evt.content_block.type !== 'text') afterTool = true
        if (evt.type !== 'content_block_delta' || !evt.delta) return
        if (evt.delta.type === 'text_delta' && evt.delta.text) {
          if (!target) clearInterval(statusTimer)
          if (afterTool && /\S$/.test(target) && /^\S/.test(evt.delta.text)) target += ' '
          afterTool = false
          target += evt.delta.text
        } else if (evt.delta.type === 'citations_delta' && evt.delta.citation) {
          citations.push(evt.delta.citation)
        }
      })
      answered = true
    } catch (err) {
      clearInterval(statusTimer)
      if ((err as Error).name !== 'AbortError') {
        target += (target ? '\n\n' : '') + `Something went wrong: ${err instanceof Error ? err.message : 'please try again'}`
      }
    } finally {
      // Deliberately does NOT clear revealTimer or flip isTyping here: the
      // network stream finishing doesn't mean the on-screen reveal has
      // caught up to the full text yet (it lags behind by design). Ending
      // things here would cut a long response off mid-sentence the instant
      // the stream closes. revealTimer's own tick (above) detects
      // `streamDone` and finishes the job once `revealed` actually reaches
      // `target.length` — that's also what keeps isTyping true (blocking a
      // new message) until the full answer is actually on screen.
      streamDone = true
      clearInterval(statusTimer)
      // Stopped or failed before the answer finished: the server saved
      // nothing, so a conversation with nothing else in it must not stay in
      // the chats list.
      if (answered) savedExchangeRef.current = true
      else if (!savedExchangeRef.current) await discardEmptyConversation(conversationId).catch(() => {})
      setSavedVersion(v => v + 1)
    }
  }

  const startNewChat = () => {
    if (isTyping) return
    setConversationId(crypto.randomUUID())
    savedExchangeRef.current = false
    setActiveContext(context)
    setPendingRefocus(null)
    setMessages([welcomeMessage(context)])
    setResumeError(null)
  }

  const resumeConversation = async (conversation: ConversationSummary) => {
    if (isTyping) return
    try {
      const saved = await fetchConversationMessages(conversation.id)
      setConversationId(conversation.id)
      savedExchangeRef.current = saved.length > 0
      setActiveContext(conversation.context)
      setMessages([
        welcomeMessage(conversation.context),
        ...saved.map(m => ({ role: m.role === 'assistant' ? ('ai' as const) : ('user' as const), content: m.content, citations: m.citations ?? undefined })),
      ])
      setHasStarted(true)
      setPendingRefocus(null)
      setResumeError(null)
      forceScrollRef.current = true
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Could not open that conversation')
    }
  }

  // Switch what the AI is focused on. Before the first message this only
  // changes the scope the conversation will start with; after it, the next
  // message carries the switch.
  const changeFocus = (focus: Focus) => {
    if (isTyping) return
    const next: AiContext | undefined = focus.type === 'firm' ? undefined : focus
    const started = messages.some(m => m.role === 'user')
    setActiveContext(next)
    if (started) setPendingRefocus(focus.type === 'firm' ? { type: 'firm' } : focus)
    else setMessages([welcomeMessage(next)])
  }

  const attachedFiles = [...messages.flatMap(m => (m.attachmentName ? [m.attachmentName] : [])), ...(pendingFile ? [`${pendingFile.name} (not sent yet)`] : [])]

  const stopGenerating = () => {
    abortRef.current?.abort()
    abortRef.current = null
    if (statusTimerRef.current) clearInterval(statusTimerRef.current)
    if (revealTimerRef.current) clearInterval(revealTimerRef.current)
    setIsTyping(false)
  }

  const chips = suggestedQuestions(activeContext)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: hasStarted ? 'transparent' : 'rgb(var(--ink-rgb) / 0.25)',
        backdropFilter: hasStarted ? 'none' : 'blur(4px)',
        transition: 'opacity 0.3s ease, background 0.4s ease',
        opacity: visible ? 1 : 0,
      }}
      onClick={e => !hasStarted && e.target === e.currentTarget && handleClose()}
    >
      {/* Drawer panel — expands to fill the screen like its own page once a
          real conversation starts, instead of staying a partial bottom sheet. */}
      <div
        className="mt-auto flex flex-col relative"
        style={{
          height: hasStarted ? '100dvh' : '90dvh',
          background: 'rgb(var(--canvas-rgb) / 0.96)',
          backdropFilter: 'blur(24px)',
          borderTop: hasStarted ? 'none' : '1px solid rgb(var(--line-rgb) / 0.50)',
          borderRadius: hasStarted ? 0 : '24px 24px 0 0',
          boxShadow: hasStarted ? 'none' : '0 -20px 60px rgba(0,0,0,0.14)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), height 0.4s ease, border-radius 0.4s ease',
        }}
      >
        {/* Drag handle — only meaningful while this still reads as a sheet */}
        {!hasStarted && (
          <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgb(var(--line-rgb) / 0.60)' }} />
          </div>
        )}

        {/* Header */}
        <div
          ref={headerRef}
          className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 flex-shrink-0 ${hasStarted ? 'absolute top-0 inset-x-0 z-30' : ''}`}
          // Full screen: the header floats over the conversation, which
          // scrolls underneath and shows through it, blurred.
          style={{
            borderBottom: '1px solid rgb(var(--line-rgb) / 0.30)',
            ...(hasStarted ? { background: 'rgb(var(--canvas-rgb) / 0.68)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } : {}),
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setChatsOpen(o => !o)}
              aria-label={chatsOpen ? 'Hide chats' : 'Show chats'}
              aria-pressed={chatsOpen}
              title="Chats"
              className="btn-icon"
              style={chatsOpen ? { background: 'rgb(var(--primary-rgb) / 0.12)', color: 'var(--primary)' } : { color: 'var(--text-600)' }}
            >
              <SidebarSimple size={19} aria-hidden="true" />
            </button>
            <div
              className="w-9 h-9 hidden sm:flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 10 }}
              aria-hidden="true"
            >
              R
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold truncate" style={{ color: 'var(--text-900)', letterSpacing: '-0.015em' }}>RegWay AI Copilot</h2>
              <div className="text-xs truncate" style={{ color: 'var(--text-400)' }}>
                {activeContext ? `Focused on ${activeContext.name}` : firm ? `Grounded in live web search for ${firm.name}` : 'Loading firm context…'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!contextOpen && (
              <button
                onClick={() => setContextOpen(true)}
                className="btn-tool hidden xl:inline-flex"
                style={{ fontSize: 13 }}
              >
                Session context
              </button>
            )}
            <button onClick={handleClose} className="btn-icon" aria-label="Close RegWay AI" title="Close">
              <X size={17} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content area: chats sidebar + conversation + session context */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative" style={{ '--chat-top': hasStarted ? `${headerH}px` : '0px' } as React.CSSProperties}>
          {chatsOpen && (
            <ConversationHistory
              activeId={conversationId}
              refreshKey={savedVersion}
              disabled={isTyping}
              onResume={resumeConversation}
              onNewChat={startNewChat}
              onClose={() => setChatsOpen(false)}
            />
          )}

          {/* Conversation */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              onWheel={handleUserScrollIntent}
              onTouchMove={handleUserScrollIntent}
              className="flex-1 overflow-y-auto scrollable min-h-0 px-4 sm:px-6 py-5 space-y-5"
              style={{ overscrollBehavior: 'contain', paddingTop: 'calc(20px + var(--chat-top, 0px))' }}
            >
              {resumeError && <div className="text-xs" role="alert" style={{ color: 'var(--warning)' }}>{resumeError}</div>}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div
                      className="w-7 h-7 flex items-center justify-center text-xs font-semibold text-white mr-3 mt-1 flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 8 }}
                      aria-hidden="true"
                    >
                      R
                    </div>
                  )}
                  <div className="max-w-[88%] sm:max-w-[72%] min-w-0 space-y-2 group">
                    <div
                      className={msg.role === 'ai' ? 'glass-card p-4' : ''}
                      style={msg.role === 'user' ? {
                        background: 'rgb(var(--primary-rgb) / 0.12)',
                        border: '1px solid rgb(var(--primary-rgb) / 0.20)',
                        borderRadius: '20px 20px 4px 20px',
                        padding: '12px 16px',
                        color: 'var(--text-900)',
                      } : {}}
                    >
                      {msg.role === 'ai' && msg.content === '' && isTyping && i === messages.length - 1 ? (
                        <div className="flex items-center gap-2.5 py-1">
                          {msg.status && <span className="text-sm italic" style={{ color: 'var(--text-400)' }}>{msg.status}</span>}
                          <div className="flex items-center gap-1">
                            {[0, 1, 2].map(d => (
                              <span
                                key={d}
                                className="dot-wobble"
                                style={{ width: 5, height: 5, background: 'var(--text-300)', animationDelay: `${d * 0.15}s` }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.attachmentName && (
                            <div className="text-xs mb-1.5 flex items-center gap-1" style={{ color: msg.role === 'user' ? 'var(--primary-dark)' : 'var(--text-400)' }}>
                              <Paperclip size={13} aria-hidden="true" />
                              {msg.attachmentName}
                            </div>
                          )}
                          <div
                            className={msg.role === 'ai' ? 'ai-markdown text-[15px] leading-relaxed break-words' : 'text-[15px] leading-relaxed whitespace-pre-line break-words'}
                            style={{ color: 'var(--text-900)' }}
                            dangerouslySetInnerHTML={{
                              __html:
                                msg.role === 'ai'
                                  ? isTyping && i === messages.length - 1
                                    ? withCursor(renderMarkdown(msg.content))
                                    : renderMarkdown(msg.content)
                                  : msg.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                            }}
                          />
                        </>
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {Array.from(new Map(msg.citations.filter(c => c.url).map(c => [c.url, c])).values()).map((c, ci) => (
                              <a
                                key={ci}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium flex items-center gap-1 hover:underline"
                                style={{
                                  background: 'rgb(var(--neutral-rgb) / 0.10)',
                                  color: 'var(--primary)',
                                  borderRadius: 6,
                                  border: '1px solid rgb(var(--neutral-rgb) / 0.18)',
                                  padding: '3px 7px',
                                  maxWidth: 220,
                                }}
                              >
                                <span className="truncate">{c.title || c.url}</span>
                                <ArrowUpRight size={11} weight="bold" aria-hidden="true" className="flex-shrink-0" />
                              </a>
                            ))}
                        </div>
                      )}
                      {msg.role === 'ai' && msg.content !== '' && !(isTyping && i === messages.length - 1) && (
                        <CopyButton text={msg.content} />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>

            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center rounded-full transition-ui hover:shadow-md"
                style={{ bottom: hasStarted ? 160 : 180, background: 'rgb(var(--surface-rgb) / 0.95)', border: '1px solid rgb(var(--line-rgb) / 0.60)', boxShadow: '0 4px 16px rgb(var(--primary-rgb) / 0.18)', color: 'var(--primary)' }}
                title="Scroll to latest"
                aria-label="Scroll to latest"
              >
                <ArrowDown size={15} weight="bold" aria-hidden="true" />
              </button>
            )}

            {/* Suggested questions — only until the first message is sent */}
            {!hasStarted && (
              <div
                className="px-6 py-3 flex gap-2 overflow-x-auto flex-shrink-0"
                style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.25)' }}
              >
                {chips.map(chip => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    className="btn-tool flex-shrink-0"
                    style={{ fontSize: 13, color: 'var(--primary)' }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.25)' }}>
              {pendingRefocus && (
                <div className="mb-2 text-xs" style={{ color: 'var(--primary)' }}>
                  Focus switched to {activeContext ? activeContext.name : 'the whole firm'}. Your next message will be answered about it.
                </div>
              )}
              {pendingFile && (
                <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--primary)' }}>
                  <Paperclip size={14} aria-hidden="true" />
                  <span className="truncate">{pendingFile.name}</span>
                  <button onClick={() => setPendingFile(null)} aria-label="Remove attached file" className="btn-icon" style={{ width: 22, height: 22 }}>
                    <X size={11} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              )}
              {attachError && <div className="text-xs mb-2" style={{ color: 'var(--text-600)' }}>{attachError}</div>}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    rows={3}
                    name="message"
                    aria-label="Message RegWay AI"
                    className="glass-input w-full py-4 px-5 pr-20 resize-none block"
                    style={{ fontSize: 15, color: 'var(--text-900)', lineHeight: 1.4, maxHeight: MAX_INPUT_HEIGHT, overflowY: 'auto', borderRadius: 18 }}
                    placeholder="Ask RegWay AI about regulatory impact, compliance obligations, or fund exposure…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (!isTyping) sendMessage(input)
                      }
                    }}
                  />
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf" onChange={pickFile} style={{ display: 'none' }} aria-label="Attach a file" tabIndex={-1} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTyping}
                    className="btn-icon absolute right-12 bottom-[9px]"
                    style={{ width: 32, height: 32 }}
                    aria-label="Attach a .txt, .md, or .pdf file"
                    title="Attach a .txt, .md, or .pdf file"
                  >
                    <Paperclip size={16} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => (isTyping ? stopGenerating() : sendMessage(input))}
                    className="absolute right-2 bottom-[9px] w-8 h-8 flex items-center justify-center text-white transition-ui active:scale-95"
                    style={{ background: isTyping ? '#334155' : 'linear-gradient(135deg,var(--brand),var(--brand-light))', borderRadius: 9999 }}
                    title={isTyping ? 'Stop generating' : 'Send'}
                    aria-label={isTyping ? 'Stop generating' : 'Send'}
                  >
                    {isTyping ? (
                      <Stop size={13} weight="fill" aria-hidden="true" />
                    ) : (
                      <PaperPlaneRight size={15} weight="fill" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              <div className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-300)' }}>
                RegWay AI references primary regulatory sources only. Always verify with qualified legal counsel.
              </div>
            </div>
          </div>

          {contextOpen && (
            <SessionContext
              firm={firm}
              funds={funds}
              companies={companies}
              focus={activeContext}
              files={attachedFiles}
              disabled={isTyping}
              onFocus={changeFocus}
              onClose={() => setContextOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
