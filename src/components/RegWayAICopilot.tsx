import { useState, useRef, useEffect } from 'react'
import { callFunction } from '../lib/functions'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFunds, fetchPortfolioCompanies } from '../lib/data'
import type { Firm, Fund, PortfolioCompany } from '../lib/types'

interface RegWayAICopilotProps {
  onClose: () => void
}

interface Citation {
  url?: string
  title?: string
}

interface Message {
  role: 'user' | 'ai'
  content: string
  citations?: Citation[]
}

const WELCOME_MESSAGE: Message = {
  role: 'ai',
  content: "Ask me anything about your firm's regulatory exposure — I'll search live sources and cite what I find.",
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function RegWayAICopilot({ onClose }: RegWayAICopilotProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [visible, setVisible] = useState(false)
  const [firm, setFirm] = useState<Firm | null>(null)
  const [funds, setFunds] = useState<Fund[]>([])
  const [companies, setCompanies] = useState<PortfolioCompany[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTimeout(() => setVisible(true), 30)
  }, [])

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages(m => [...m, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const result = await callFunction<{ content: string; citations: Citation[] }>('harvey-chat', { message: text })
      setMessages(m => [...m, { role: 'ai', content: result.content, citations: result.citations }])
    } catch (err) {
      setMessages(m => [
        ...m,
        { role: 'ai', content: `Something went wrong: ${err instanceof Error ? err.message : 'please try again'}` },
      ])
    } finally {
      setIsTyping(false)
    }
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
        background: 'rgba(15,23,42,0.25)',
        backdropFilter: 'blur(4px)',
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
      }}
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      {/* Drawer panel */}
      <div
        className="mt-auto flex flex-col"
        style={{
          height: '90vh',
          background: 'rgba(253,251,247,0.96)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(186,230,253,0.50)',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.14)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(186,230,253,0.60)' }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(186,230,253,0.30)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center text-base font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 12 }}
            >
              H
            </div>
            <div>
              <div className="font-semibold" style={{ color: '#0F172A', letterSpacing: '-0.01em' }}>RegWay AI Copilot</div>
              <div className="text-xs flex items-center gap-1.5" style={{ color: '#64748B' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#38BDF8' }} />
                {firm ? `Grounded in live web search for ${firm.name}` : 'Loading firm context…'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Content area: conversation + sidebar */}
        <div className="flex-1 flex overflow-hidden">

          {/* Conversation */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollable px-6 py-5 space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div
                      className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white mr-3 mt-1 flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 8 }}
                    >
                      H
                    </div>
                  )}
                  <div className="max-w-[72%] space-y-2">
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
                      <div
                        className="text-sm leading-relaxed whitespace-pre-line"
                        style={{ color: '#0F172A' }}
                        dangerouslySetInnerHTML={{
                          __html: escapeHtml(msg.content)
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n\n/g, '<br/><br/>')
                            .replace(/\n/g, '<br/>'),
                        }}
                      />
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {msg.citations
                            .filter(c => c.url)
                            .map((c, ci) => (
                              <a
                                key={ci}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium flex items-center gap-1 hover:underline px-2 py-1"
                                style={{
                                  background: 'rgba(15,23,42,0.05)',
                                  color: '#0284C7',
                                  borderRadius: 6,
                                  border: '1px solid rgba(15,23,42,0.08)',
                                }}
                              >
                                {c.title || c.url}
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1 9L9 1M9 1H4M9 1v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                              </a>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#0F172A,#334155)', borderRadius: 8 }}
                  >
                    H
                  </div>
                  <div
                    className="glass-card px-4 py-3 flex items-center gap-1.5"
                  >
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{
                          background: '#94a3b8',
                          animationDelay: `${i * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Action chips */}
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

            {/* Input */}
            <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(186,230,253,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    className="glass-input w-full py-3.5 px-5 pr-12 text-sm"
                    style={{ fontSize: 14, color: '#0F172A' }}
                    placeholder="Ask RegWay AI about regulatory impact, compliance obligations, or fund exposure..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white"
                    style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 9999 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M14 8L2 2l3 6-3 6 12-6z" fill="white"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="text-[10px] mt-2 text-center" style={{ color: '#94a3b8' }}>
                RegWay AI references primary regulatory sources only. Always verify with qualified legal counsel.
              </div>
            </div>
          </div>

          {/* Context sidebar */}
          <div
            className="w-72 hidden xl:flex flex-col flex-shrink-0 overflow-y-auto scrollable"
            style={{ borderLeft: '1px solid rgba(186,230,253,0.30)', padding: '20px 20px' }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: '#64748B' }}>
              Session Context
            </div>
            <div className="space-y-3">
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(186,230,253,0.35)' }}
              >
                <div className="text-xs font-medium mb-1" style={{ color: '#334155' }}>Active Firm</div>
                <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>{firm?.name || 'Loading…'}</div>
                <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                  {firm?.hq_location || 'Unknown location'} · {(firm?.jurisdictions ?? []).length} jurisdictions
                </div>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(186,230,253,0.35)' }}
              >
                <div className="text-xs font-medium mb-2" style={{ color: '#334155' }}>Active Funds</div>
                {funds.length === 0 ? (
                  <div className="text-xs" style={{ color: '#94a3b8' }}>None on file</div>
                ) : (
                  funds.map(f => (
                    <div key={f.id} className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0284C7' }} />
                      <span className="text-xs" style={{ color: '#334155' }}>{f.name}{f.size ? ` · ${f.size}` : ''}</span>
                    </div>
                  ))
                )}
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(186,230,253,0.35)' }}
              >
                <div className="text-xs font-medium mb-2" style={{ color: '#334155' }}>Portfolio Companies</div>
                {companies.length === 0 ? (
                  <div className="text-xs" style={{ color: '#94a3b8' }}>None on file</div>
                ) : (
                  companies.map(c => (
                    <div key={c.id} className="flex items-center gap-2 mb-1.5">
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#BAE6FD' }} />
                      <span className="text-xs" style={{ color: '#334155' }}>{c.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
