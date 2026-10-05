import { useState, useRef, useEffect } from 'react'
import { streamFunction } from '../lib/functions'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFunds, fetchPortfolioCompanies, fetchConversationMessages, type ConversationSummary } from '../lib/data'
import ConversationHistory from './ConversationHistory'
import SessionContext, { type Focus } from './SessionContext'
import { renderMarkdown } from '../lib/markdown'
import type { Firm, Fund, PortfolioCompany, AiContext } from '../lib/types'

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

function welcomeMessage(context?: AiContext | null): Message {
  if (context?.type === 'regulation') {
    return { role: 'ai', content: `Ask me anything about "${context.name}" — I'll search live sources and cite what I find.` }
  }
  if (context?.type === 'fund' || context?.type === 'company') {
    return { role: 'ai', content: `Ask me anything about ${context.name}'s regulatory exposure — I'll search live sources and cite what I find.` }
  }
  return { role: 'ai', content: "Ask me anything about your firm's regulatory exposure — I'll search live sources and cite what I find." }
}

// The same limits regway-ai-chat enforces: input is billed by size, so a
// very large file would make one message unusually expensive.
const MAX_PDF_BYTES = 5 * 1024 * 1024
const MAX_TEXT_BYTES = 150 * 1024

// How tall the chat input is allowed to auto-grow before it scrolls
// internally instead of pushing the rest of the drawer around.
const MAX_INPUT_HEIGHT = 160

// Shown in the empty AI bubble while waiting for the first token — cycles
// every couple of seconds so a slow web-search phase (Claude's tool-use
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
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 text-[11px] mt-2"
      style={{ color: '#94a3b8' }}
      title="Copy message"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 5" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span style={{ color: '#0284C7' }}>Copied</span>
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M3.5 10.5h-1a1 1 0 01-1-1v-7a1 1 0 011-1h7a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
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
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
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

    const revealTimer = setInterval(() => {
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
      revealed = Math.min(target.length, revealed + REVEAL_CHARS_PER_TICK)
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
          target += '\n\n*(Response cut off — reached the length limit. Ask me to continue for more.)*'
          return
        }
        if (evt.type !== 'content_block_delta' || !evt.delta) return
        if (evt.delta.type === 'text_delta' && evt.delta.text) {
          if (!target) clearInterval(statusTimer)
          target += evt.delta.text
        } else if (evt.delta.type === 'citations_delta' && evt.delta.citation) {
          citations.push(evt.delta.citation)
        }
      })
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
      setSavedVersion(v => v + 1)
    }
  }

  const startNewChat = () => {
    if (isTyping) return
    setConversationId(crypto.randomUUID())
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

  const chips = [
    "Summarize today's regulatory changes",
    'What deadlines are coming up for my funds?',
    'Any new state-level rules affecting my portfolio companies?',
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: hasStarted ? 'transparent' : 'rgba(15,23,42,0.25)',
        backdropFilter: hasStarted ? 'none' : 'blur(4px)',
        transition: 'opacity 0.3s ease, background 0.4s ease',
        opacity: visible ? 1 : 0,
      }}
      onClick={e => !hasStarted && e.target === e.currentTarget && handleClose()}
    >
      {/* Drawer panel — expands to fill the screen like its own page once a
          real conversation starts, instead of staying a partial bottom sheet. */}
      <div
        className="mt-auto flex flex-col"
        style={{
          height: hasStarted ? '100vh' : '90vh',
          background: 'rgba(253,251,247,0.96)',
          backdropFilter: 'blur(24px)',
          borderTop: hasStarted ? 'none' : '1px solid rgba(186,230,253,0.50)',
          borderRadius: hasStarted ? 0 : '24px 24px 0 0',
          boxShadow: hasStarted ? 'none' : '0 -20px 60px rgba(0,0,0,0.14)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), height 0.4s ease, border-radius 0.4s ease',
        }}
      >
        {/* Drag handle — only meaningful while this still reads as a sheet */}
        {!hasStarted && (
          <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(186,230,253,0.60)' }} />
          </div>
        )}

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(186,230,253,0.30)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setChatsOpen(o => !o)}
              aria-label={chatsOpen ? 'Hide chats' : 'Show chats'}
              aria-pressed={chatsOpen}
              title="Chats"
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-slate-100"
              style={{ color: '#334155', background: chatsOpen ? 'rgba(2,132,199,0.12)' : undefined }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7 3v12" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
            <div
              className="w-10 h-10 flex items-center justify-center text-base font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 12 }}
            >
              R
            </div>
            <div>
              <div className="font-semibold" style={{ color: '#0F172A', letterSpacing: '-0.01em' }}>RegWay AI Copilot</div>
              <div className="text-xs flex items-center gap-1.5" style={{ color: '#64748B' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#38BDF8' }} />
                {activeContext ? `Focused on ${activeContext.name}` : firm ? `Grounded in live web search for ${firm.name}` : 'Loading firm context…'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!contextOpen && (
              <button
                onClick={() => setContextOpen(true)}
                className="hidden xl:inline-flex px-4 py-2 text-xs font-medium rounded-full transition-all"
                style={{ background: 'rgba(255,255,255,0.70)', color: '#334155', border: '1px solid rgba(186,230,253,0.50)' }}
              >
                Session context
              </button>
            )}
            <button
              className="px-4 py-2 text-xs font-medium rounded-full transition-all"
              style={{
                background: 'rgba(2,132,199,0.08)',
                color: '#0284C7',
                border: '1px solid rgba(2,132,199,0.20)',
              }}
            >
              Export Memo
            </button>
            <button
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
              style={{ color: '#64748B' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content area: chats sidebar + conversation + session context */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
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
            {resumeError && (
              <div className="px-6 pt-3 text-xs" style={{ color: '#B45309' }}>{resumeError}</div>
            )}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              onWheel={handleUserScrollIntent}
              onTouchMove={handleUserScrollIntent}
              className="flex-1 overflow-y-auto scrollable min-h-0 px-6 py-5 space-y-5"
            >
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div
                      className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white mr-3 mt-1 flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 8 }}
                    >
                      R
                    </div>
                  )}
                  <div className="max-w-[72%] space-y-2 group">
                    <div
                      className={msg.role === 'ai' ? 'glass-card p-4' : ''}
                      style={msg.role === 'user' ? {
                        background: 'rgba(2,132,199,0.12)',
                        border: '1px solid rgba(2,132,199,0.20)',
                        borderRadius: '20px 20px 4px 20px',
                        padding: '12px 16px',
                        color: '#0F172A',
                      } : {}}
                    >
                      {msg.role === 'ai' && msg.content === '' && isTyping && i === messages.length - 1 ? (
                        <div className="flex items-center gap-2.5 py-1">
                          {msg.status && <span className="text-sm italic" style={{ color: '#64748B' }}>{msg.status}</span>}
                          <div className="flex items-center gap-1">
                            {[0, 1, 2].map(d => (
                              <span
                                key={d}
                                className="dot-wobble"
                                style={{ width: 5, height: 5, background: '#94a3b8', animationDelay: `${d * 0.15}s` }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.attachmentName && (
                            <div className="text-xs mb-1.5 flex items-center gap-1" style={{ color: msg.role === 'user' ? '#0369A1' : '#64748B' }}>
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                                <path d="M11.5 5L6.2 10.3a2 2 0 002.8 2.8l5.3-5.3a3.5 3.5 0 00-5-5L3.5 8.6a5 5 0 007 7L15 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                              </svg>
                              {msg.attachmentName}
                            </div>
                          )}
                          <div
                            className={msg.role === 'ai' ? 'ai-markdown text-sm leading-relaxed' : 'text-sm leading-relaxed whitespace-pre-line'}
                            style={{ color: '#0F172A' }}
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
                                  background: 'rgba(15,23,42,0.05)',
                                  color: '#0284C7',
                                  borderRadius: 6,
                                  border: '1px solid rgba(15,23,42,0.08)',
                                  padding: '3px 7px',
                                  maxWidth: 220,
                                }}
                              >
                                <span className="truncate">{c.title || c.url}</span>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                                  <path d="M1 9L9 1M9 1H4M9 1v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
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
                className="absolute left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center rounded-full transition-all hover:shadow-md"
                style={{ bottom: hasStarted ? 160 : 180, background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(186,230,253,0.60)', boxShadow: '0 4px 16px rgba(2,132,199,0.18)', color: '#0284C7' }}
                title="Scroll to latest"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}

            {/* Suggested questions — only until the first message is sent */}
            {!hasStarted && (
              <div
                className="px-6 py-3 flex gap-2 overflow-x-auto flex-shrink-0"
                style={{ borderTop: '1px solid rgba(186,230,253,0.25)' }}
              >
                {chips.map(chip => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    className="text-xs px-3 py-2 rounded-full whitespace-nowrap flex-shrink-0 transition-all hover:shadow-sm"
                    style={{
                      background: 'rgba(224,242,254,0.60)',
                      color: '#0284C7',
                      border: '1px solid rgba(186,230,253,0.50)',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(186,230,253,0.25)' }}>
              {pendingRefocus && (
                <div className="mb-2 text-xs" style={{ color: '#0284C7' }}>
                  Focus switched to {activeContext ? activeContext.name : 'the whole firm'}. Your next message will be answered about it.
                </div>
              )}
              {pendingFile && (
                <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: '#0284C7' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 5L6.2 10.3a2 2 0 002.8 2.8l5.3-5.3a3.5 3.5 0 00-5-5L3.5 8.6a5 5 0 007 7L15 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  {pendingFile.name}
                  <button onClick={() => setPendingFile(null)} style={{ color: '#94a3b8' }}>✕</button>
                </div>
              )}
              {attachError && <div className="text-xs mb-2" style={{ color: '#334155' }}>{attachError}</div>}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    className="glass-input w-full pt-3.5 pb-4 px-5 pr-20 text-sm resize-none block"
                    style={{ fontSize: 14, color: '#0F172A', lineHeight: 1.4, maxHeight: MAX_INPUT_HEIGHT, overflowY: 'auto', borderRadius: 18 }}
                    placeholder="Ask RegWay AI about regulatory impact, compliance obligations, or fund exposure..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (!isTyping) sendMessage(input)
                      }
                    }}
                  />
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf" onChange={pickFile} style={{ display: 'none' }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTyping}
                    className="absolute right-12 bottom-[9px] w-8 h-8 flex items-center justify-center rounded-full hover:bg-sky-50 transition-colors disabled:opacity-40"
                    style={{ color: '#94a3b8' }}
                    title="Attach a .txt, .md, or .pdf file"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M11.5 5L6.2 10.3a2 2 0 002.8 2.8l5.3-5.3a3.5 3.5 0 00-5-5L3.5 8.6a5 5 0 007 7L15 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => (isTyping ? stopGenerating() : sendMessage(input))}
                    className="absolute right-2 bottom-[9px] w-8 h-8 flex items-center justify-center text-white transition-all"
                    style={{ background: isTyping ? '#334155' : 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 9999 }}
                    title={isTyping ? 'Stop generating' : 'Send'}
                  >
                    {isTyping ? (
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" fill="white"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M14 8L2 2l3 6-3 6 12-6z" fill="white"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="text-[10px] mt-2 text-center" style={{ color: '#94a3b8' }}>
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
