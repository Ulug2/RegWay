import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { streamFunction } from '../lib/functions'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFunds, fetchPortfolioCompanies, fetchConversationMessages, discardEmptyConversation, markConversationStopped, type AnswerReview, type ConversationSummary } from '../lib/data'
import ConversationHistory from './ConversationHistory'
import SessionContext, { type Focus } from './SessionContext'
import { renderMarkdownBlocks } from '../lib/markdown'
import type { Firm, Fund, PortfolioCompany, AiContext } from '../lib/types'
import { ArrowDown, ArrowUpRight, Check, CheckCircle, Copy, PaperPlaneRight, Paperclip, SidebarSimple, Stop, WarningCircle, X } from './icons'

interface RegWayAICopilotProps {
  onClose: () => void
  context?: AiContext | null
  // Closed while an answer was still being written: kept alive out of sight
  // so the answer finishes and is saved, and shown again as it was if the
  // chat is reopened before then.
  hidden?: boolean
  onBusyChange?: (busy: boolean) => void
}

interface Citation {
  url?: string
  title?: string
}

// One step of the check run after an answer that claims something applies
// to the firm (regway-ai-chat/review.ts), as the server labels it.
interface CheckStep {
  step: 'facts' | 'sources'
  state: 'running' | 'done' | 'failed'
  label: string
}

interface Message {
  role: 'user' | 'ai'
  content: string
  citations?: Citation[]
  attachmentName?: string
  status?: string
  steps?: CheckStep[]
  review?: AnswerReview | null
}

// Suggested first questions, about whatever the chat is focused on. Worded
// so the three together fill one line of the conversation column. The
// button shows `label`; `prompt` (which names the fund or company) is sent.
interface Suggestion {
  label: string
  prompt: string
}

function suggestedQuestions(context?: AiContext | null): Suggestion[] {
  if (context?.type === 'regulation')
    return ['Summarize this in plain language', 'Who does this apply to?', 'What are the key dates and deadlines?'].map(q => ({ label: q, prompt: q }))
  if (context)
    return [
      { label: "Summarize what's new here", prompt: `Summarize what's new for ${context.name}` },
      { label: 'What deadlines are coming up?', prompt: `What deadlines are coming up for ${context.name}?` },
      { label: 'Which developments matter most?', prompt: `Which developments matter most for ${context.name}?` },
    ]
  return [
    { label: "Summarize today's changes", prompt: "Summarize today's regulatory changes" },
    { label: 'What fund deadlines are coming up?', prompt: 'What deadlines are coming up for my funds?' },
    { label: 'Any new state rules for my companies?', prompt: 'Any new state-level rules affecting my portfolio companies?' },
  ]
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
const MAX_INPUT_HEIGHT = 160


// Shown in the empty AI bubble while waiting for the first token — cycles
// every couple of seconds so a slow web-search phase (the model's tool-use
// round-trip before any text arrives) doesn't look stalled.
// One word — the wobbling dots next to it already carry the "…" meaning.
const STATUS_PHRASES = ['Diligencing', 'Underwriting', 'Benchmarking', 'Sourcing', 'Structuring', 'Modeling', 'Auditing', 'Researching']
const pickStatusPhrase = (exclude?: string) => {
  const options = exclude ? STATUS_PHRASES.filter(p => p !== exclude) : STATUS_PHRASES
  return options[Math.floor(Math.random() * options.length)]
}

// Decoupled from network timing: the stream delivers text in uneven bursts
// (a long one after each web search), and the display shows it whole words
// at a time, a share of what is waiting on each tick, so it keeps up with
// the model instead of ticking out letter by letter.
const REVEAL_INTERVAL_MS = 16
const REVEAL_MIN_CHARS = 4
const REVEAL_SHARE = 0.12
const STATUS_CYCLE_MS = 1800

// Where the text on screen should end after `ticks` more ticks: never in
// the middle of a word, except the last word once the stream is done.
function revealEnd(text: string, shown: number, ticks: number, streamDone: boolean): number {
  const step = Math.max(REVEAL_MIN_CHARS * ticks, Math.ceil((text.length - shown) * REVEAL_SHARE * ticks))
  const end = shown + step
  if (end >= text.length) {
    if (streamDone) return text.length
    // The last word may still be arriving: stop before it.
    const lastSpace = text.search(/\s\S*$/)
    return lastSpace > shown ? lastSpace : shown
  }
  const nextSpace = text.slice(end).search(/\s/)
  if (nextSpace !== -1) return end + nextSpace
  return streamDone ? text.length : Math.max(shown, text.search(/\s\S*$/))
}

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

interface SseEvent {
  type: string
  content_block?: { type: string }
  delta?: { type: string; text?: string; citation?: Citation; stop_reason?: string }
  // RegWay's own events after the answer: regway_status, regway_review.
  step?: CheckStep['step']
  state?: CheckStep['state']
  label?: string
  review?: AnswerReview
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

// The Copy button on a code block is plain HTML from renderMarkdown, so the
// click is caught on the conversation and the code beside it is copied.
async function copyCode(e: React.MouseEvent) {
  const button = (e.target as HTMLElement).closest('[data-copy-code]')
  const code = button?.closest('.code-block')?.querySelector('pre')?.textContent
  if (!button || code == null) return
  try {
    await navigator.clipboard.writeText(code)
  } catch {
    return
  }
  button.textContent = 'Copied'
  setTimeout(() => (button.textContent = 'Copy'), 1500)
}

const CHECKED_AGAINST: Record<string, string> = {
  'facts,sources': 'your recorded facts and the cited sources',
  facts: 'your recorded facts',
  sources: 'the cited sources',
}

// Under an answer that claims something applies to the firm: the check's
// steps while it runs, then its note. Nothing for any other answer.
function AnswerCheck({ steps, review }: { steps?: CheckStep[]; review?: AnswerReview | null }) {
  const failed = (steps ?? []).filter(s => s.state === 'failed')
  if (review) {
    const against = CHECKED_AGAINST[review.checks.join(',')] ?? 'your recorded facts'
    return (
      <div className={`notice mt-3 ${review.status === 'caution' ? 'is-warn' : ''}`} role="status">
        {review.status === 'supported' ? (
          <div className="flex items-start gap-2">
            <CheckCircle size={16} aria-hidden="true" className="flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
            <span>Checked against {against}: supported.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <WarningCircle size={16} aria-hidden="true" className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
            <div className="min-w-0">
              <div className="font-medium" style={{ color: 'var(--text-900)' }}>Checked against {against}: worth confirming before you rely on this.</div>
              <ul className="mt-1 space-y-1 list-disc pl-4">
                {review.notes.map((n, i) => (
                  <li key={i}>{n.note}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {failed.map(s => (
          <div key={s.step} className="mt-1.5 text-xs" style={{ color: 'var(--text-400)' }}>
            {s.label}.
          </div>
        ))}
      </div>
    )
  }
  if (!steps?.length) return null
  return (
    <div className="mt-3 space-y-1.5 text-sm" role="status" aria-live="polite">
      {steps.map(s => (
        <div key={s.step} className="flex items-center gap-2" style={{ color: 'var(--text-400)' }}>
          {s.state === 'running' ? (
            <span className="flex items-center gap-0.5 w-4 justify-center" aria-hidden="true">
              {[0, 1, 2].map(d => (
                <span key={d} className="dot-wobble" style={{ width: 3, height: 3, background: 'var(--text-300)', animationDelay: `${d * 0.15}s` }} />
              ))}
            </span>
          ) : s.state === 'done' ? (
            <CheckCircle size={16} aria-hidden="true" style={{ color: 'var(--primary)' }} />
          ) : (
            <WarningCircle size={16} aria-hidden="true" style={{ color: 'var(--text-400)' }} />
          )}
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )
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

export default function RegWayAICopilot({ onClose, context, hidden = false, onBusyChange }: RegWayAICopilotProps) {
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
  // The floating input's height (it grows with the text and with an
  // attached file), so the last message can always scroll clear of it.
  const floatRef = useRef<HTMLDivElement>(null)
  const [floatH, setFloatH] = useState(96)
  useLayoutEffect(() => {
    const el = floatRef.current
    if (!el) return
    const measure = () => setFloatH(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (headerRef.current) setHeaderH(headerRef.current.offsetHeight)
  }, [])
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
    if (hidden) return
    const timer = setTimeout(() => setVisible(true), 30)
    // Reopened part-way through an answer: go to where it is being written.
    forceScrollRef.current = true
    return () => clearTimeout(timer)
  }, [hidden])

  useEffect(() => {
    onBusyChange?.(isTyping)
  }, [isTyping, onBusyChange])

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
    // The check after the answer, if one runs.
    let steps: CheckStep[] = []
    let review: AnswerReview | undefined
    const showCheck = () =>
      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = { ...copy[copy.length - 1], steps: [...steps], review }
        return copy
      })

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
      const ticks = Math.max(1, Math.round((now - lastReveal) / REVEAL_INTERVAL_MS))
      lastReveal = now
      if (revealed >= target.length || (!streamDone && revealEnd(target, revealed, 1, false) <= revealed)) {
        if (streamDone && revealed >= target.length) {
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
      revealed = revealEnd(target, revealed, ticks, streamDone)
      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'ai', content: target.slice(0, revealed), citations: [...citations], steps: [...steps], review }
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
        if (evt.type === 'regway_status' && evt.step && evt.state && evt.label) {
          const next = { step: evt.step, state: evt.state, label: evt.label }
          steps = steps.some(s => s.step === next.step) ? steps.map(s => (s.step === next.step ? next : s)) : [...steps, next]
          showCheck()
          return
        }
        if (evt.type === 'regway_review' && evt.review) {
          review = evt.review
          showCheck()
          return
        }
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
      // Stopped or cut off during the check: a step can no longer finish.
      if (steps.some(st => st.state === 'running')) {
        steps = steps.filter(st => st.state !== 'running')
        showCheck()
      }
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
        ...saved.map(m => ({ role: m.role === 'assistant' ? ('ai' as const) : ('user' as const), content: m.content, citations: m.citations ?? undefined, review: m.review ?? undefined })),
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
    // The server doesn't see the closed connection; it watches for this.
    if (abortRef.current) markConversationStopped(conversationId).catch(() => {})
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
      hidden={hidden}
      style={{
        display: hidden ? 'none' : undefined,
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* The chat takes the whole screen as soon as it opens, rolling up
          from the bottom: it's a page of its own, not a sheet over one. */}
      <div
        className="flex flex-col relative"
        style={{
          height: '100dvh',
          background: 'var(--canvas)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Header: floats over the conversation, which scrolls underneath
            and shows through it, blurred. */}
        <div
          ref={headerRef}
          className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5"
          style={{
            borderBottom: '1px solid rgb(var(--line-rgb) / 0.30)',
            background: 'rgb(var(--canvas-rgb) / 0.68)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
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
              className="w-9 h-9 hidden sm:flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ background: 'var(--text-900)', color: 'var(--canvas)', borderRadius: 10 }}
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
        <div className="flex-1 flex overflow-hidden min-h-0 relative" style={{ '--chat-top': `${headerH}px` } as React.CSSProperties}>
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
              style={{ overscrollBehavior: 'contain', paddingTop: 'calc(20px + var(--chat-top, 0px))', paddingBottom: floatH + 8 }}
            >
              {resumeError && <div className="text-xs" role="alert" style={{ color: 'var(--warning)' }}>{resumeError}</div>}
              <div className="max-w-3xl mx-auto space-y-7" onClick={copyCode}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {/* An answer is set straight on the page, full width; only the
                      user's own message sits in a bubble. */}
                  <div className={`min-w-0 space-y-2 group ${msg.role === 'ai' ? 'w-full' : 'max-w-[85%]'}`}>
                    <div
                      style={msg.role === 'user' ? {
                        background: 'rgb(var(--neutral-rgb) / 0.14)',
                        borderRadius: 20,
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
                            <div className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-400)' }}>
                              <Paperclip size={13} aria-hidden="true" />
                              {msg.attachmentName}
                            </div>
                          )}
                          {msg.role === 'ai' ? (
                            // One element per paragraph, list, table or code
                            // block: while an answer streams in, the blocks
                            // already shown stay put and each new one fades in
                            // below them; the last one fills in word by word.
                            <div
                              className={`ai-markdown text-[15.5px] leading-[1.7] break-words ${isTyping && i === messages.length - 1 ? 'is-streaming' : ''}`}
                              style={{ color: 'var(--text-900)' }}
                            >
                              {renderMarkdownBlocks(msg.content).map((block, bi) => (
                                <div key={bi} className={`md-block is-${block.kind}`} dangerouslySetInnerHTML={{ __html: block.html }} />
                              ))}
                            </div>
                          ) : (
                            <div
                              className="text-[15px] leading-relaxed whitespace-pre-line break-words"
                              style={{ color: 'var(--text-900)' }}
                              dangerouslySetInnerHTML={{ __html: msg.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}
                            />
                          )}
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
                      {msg.role === 'ai' && <AnswerCheck steps={msg.steps} review={msg.review} />}
                      {msg.role === 'ai' && msg.content !== '' && !(isTyping && i === messages.length - 1) && (
                        <CopyButton text={msg.content} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>

              <div ref={bottomRef} />
            </div>

            {showScrollButton && (
              <button
                onClick={scrollToBottom}
                className="absolute left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center rounded-full transition-ui hover:shadow-md"
                style={{ bottom: floatH + 8, background: 'rgb(var(--surface-rgb) / 0.95)', border: '1px solid rgb(var(--line-rgb) / 0.60)', boxShadow: 'var(--shadow-float)', color: 'var(--primary)' }}
                title="Scroll to latest"
                aria-label="Scroll to latest"
              >
                <ArrowDown size={15} weight="bold" aria-hidden="true" />
              </button>
            )}

            {/* Suggested questions — only until the first message is sent */}
            {/* Suggestions and the input float over the foot of the
                conversation, which scrolls underneath them. */}
            <div
              ref={floatRef}
              className="absolute bottom-0 inset-x-0 z-10 px-4 sm:px-6 pt-8 pb-4 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgb(var(--canvas-rgb) / 0), rgb(var(--canvas-rgb) / 0.92) 32px)' }}
            >
            <div className="max-w-3xl mx-auto pointer-events-auto">
            {!hasStarted && (
                <div className="flex flex-wrap gap-2 mb-3">
                {chips.map(chip => (
                  <button
                    key={chip.prompt}
                    onClick={() => sendMessage(chip.prompt)}
                    title={chip.prompt}
                    className="btn-tool flex-auto whitespace-nowrap"
                    style={{ fontSize: 13, background: 'rgb(var(--surface-rgb))' }}
                  >
                    {chip.label}
                  </button>
                ))}
                </div>
            )}

            {/* Input */}
            <div>
              <div>
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
                    rows={1}
                    name="message"
                    aria-label="Message RegWay AI"
                    className="glass-input w-full pt-3.5 pb-4 px-5 pr-20 resize-none block"
                    style={{ fontSize: 15, color: 'var(--text-900)', lineHeight: 1.4, maxHeight: MAX_INPUT_HEIGHT, overflowY: 'auto', borderRadius: 18, background: 'rgb(var(--surface-rgb) / 0.94)', boxShadow: 'var(--shadow-float)' }}
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
                    style={{ background: isTyping ? '#52525B' : 'var(--brand)', borderRadius: 9999 }}
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
              {!hasStarted && (
                <div className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-300)' }}>
                  RegWay AI references primary regulatory sources only. Always verify with qualified legal counsel.
                </div>
              )}
              </div>
            </div>
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
