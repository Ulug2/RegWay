import type { AiContext, Firm, Fund, PortfolioCompany } from '../lib/types'
import { useState } from 'react'
import { CaretDown, CaretUp, X } from './icons'

// The chat's right-hand panel: what RegWay AI is focused on, and the firm,
// funds and portfolio companies it can be switched to; plus the files
// attached in this chat. Closable from its own header.

export type Focus = { type: 'firm' } | { type: 'fund' | 'company'; id: string; name: string }

const card = { background: 'rgb(var(--surface-rgb) / 0.70)', border: '1px solid rgb(var(--line-rgb) / 0.35)' }

function Option({ selected, disabled, onClick, children }: { selected: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-sky-50 disabled:cursor-not-allowed min-w-0"
      style={{ background: selected ? 'rgb(var(--primary-rgb) / 0.10)' : undefined, color: selected ? 'var(--primary-dark)' : 'var(--text-600)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: selected ? 'var(--primary)' : 'rgb(var(--line-rgb))' }} />
      <span className="text-[13px] truncate">{children}</span>
    </button>
  )
}

// A card whose list can be folded away: a firm can have many funds and
// companies. The header says how many there are, so a folded card still
// tells you something.
function Collapsible({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const Caret = open ? CaretUp : CaretDown
  return (
    <div className="p-3 rounded-xl" style={card}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} ${title}`}
        className="w-full flex items-center justify-between gap-2 text-xs font-medium rounded-md hover:text-[var(--text-900)]"
        style={{ color: 'var(--text-600)', marginBottom: open ? 4 : 0 }}
      >
        <span>
          {title}
          {count > 0 && <span className="num ml-1.5" style={{ color: 'var(--text-300)' }}>{count}</span>}
        </span>
        <Caret size={13} weight="bold" aria-hidden="true" style={{ color: 'var(--text-400)' }} />
      </button>
      {open && children}
    </div>
  )
}

export default function SessionContext({
  firm,
  funds,
  companies,
  focus,
  files,
  disabled,
  onFocus,
  onClose,
}: {
  firm: Firm | null
  funds: Fund[]
  companies: PortfolioCompany[]
  focus: AiContext | null | undefined
  files: string[]
  disabled: boolean
  onFocus: (focus: Focus) => void
  onClose: () => void
}) {
  const is = (type: 'fund' | 'company', id: string) => focus?.type === type && focus.id === id

  return (
    <aside
      aria-label="Session context"
      // Beside the conversation from xl; over it, from the right, below that.
      className="absolute xl:static inset-y-0 right-0 z-20 w-full sm:w-80 xl:w-72 flex flex-col flex-shrink-0 overflow-y-auto scrollable"
      style={{ borderLeft: '1px solid rgb(var(--line-rgb) / 0.30)', padding: '20px 20px', paddingTop: 'calc(20px + var(--chat-top, 0px))', background: 'var(--canvas)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="section-label">Session Context</div>
        <button onClick={onClose} aria-label="Close session context" className="btn-icon" style={{ width: 28, height: 28 }}>
          <X size={13} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-400)' }}>Choose what RegWay AI focuses on.</p>

      <div className="space-y-3">
        {focus?.type === 'regulation' && (
          <div className="p-3 rounded-xl" style={card}>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-600)' }}>Regulation</div>
            <Option selected disabled={disabled} onClick={() => {}}>{focus.name}</Option>
          </div>
        )}

        <div className="p-3 rounded-xl" style={card}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-600)' }}>Active Firm</div>
          <Option selected={!focus} disabled={disabled || !firm} onClick={() => onFocus({ type: 'firm' })}>
            {firm ? `${firm.name} (whole firm)` : 'Loading…'}
          </Option>
          {firm && (
            <div className="text-xs mt-0.5 px-2" style={{ color: 'var(--text-400)' }}>
              {firm.hq_location || 'Unknown location'} · {(firm.jurisdictions ?? []).length} jurisdictions
            </div>
          )}
        </div>

        <Collapsible title="Active Funds" count={funds.length}>
          {funds.length === 0 ? (
            <div className="text-xs px-2" style={{ color: 'var(--text-300)' }}>None on file</div>
          ) : (
            funds.map(f => (
              <Option key={f.id} selected={is('fund', f.id)} disabled={disabled} onClick={() => onFocus({ type: 'fund', id: f.id, name: f.name })}>
                {f.name}
                {f.size ? ` · ${f.size}` : ''}
              </Option>
            ))
          )}
        </Collapsible>

        <Collapsible title="Portfolio Companies" count={companies.length}>
          {companies.length === 0 ? (
            <div className="text-xs px-2" style={{ color: 'var(--text-300)' }}>None on file</div>
          ) : (
            companies.map(c => (
              <Option key={c.id} selected={is('company', c.id)} disabled={disabled} onClick={() => onFocus({ type: 'company', id: c.id, name: c.name })}>
                {c.name}
              </Option>
            ))
          )}
        </Collapsible>

        <div className="p-3 rounded-xl" style={card}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-600)' }}>Files in this chat</div>
          {files.length === 0 ? (
            <div className="text-xs px-2" style={{ color: 'var(--text-300)' }}>None attached</div>
          ) : (
            <ul className="space-y-1 px-2">
              {files.map((name, i) => (
                <li key={`${name}-${i}`} className="text-xs truncate" style={{ color: 'var(--text-600)' }} title={name}>
                  {name}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs mt-1.5 px-2" style={{ color: 'var(--text-300)' }}>Each file is read with the message it was sent with; it isn't stored.</p>
        </div>
      </div>
    </aside>
  )
}
