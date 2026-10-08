import type { AiContext, Firm, Fund, PortfolioCompany } from '../lib/types'

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
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-sky-50 disabled:cursor-not-allowed"
      style={{ background: selected ? 'rgb(var(--primary-rgb) / 0.10)' : undefined, color: selected ? 'var(--primary-dark)' : 'var(--text-600)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: selected ? 'var(--primary)' : 'rgb(var(--line-rgb))' }} />
      <span className="text-xs truncate">{children}</span>
    </button>
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
      className="w-72 hidden xl:flex flex-col flex-shrink-0 overflow-y-auto scrollable"
      style={{ borderLeft: '1px solid rgb(var(--line-rgb) / 0.30)', padding: '20px 20px' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-400)' }}>Session Context</div>
        <button onClick={onClose} aria-label="Close session context" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100" style={{ color: 'var(--text-300)' }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="text-[11px] mb-4" style={{ color: 'var(--text-300)' }}>Choose what RegWay AI focuses on.</p>

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

        <div className="p-3 rounded-xl" style={card}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-600)' }}>Active Funds</div>
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
        </div>

        <div className="p-3 rounded-xl" style={card}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-600)' }}>Portfolio Companies</div>
          {companies.length === 0 ? (
            <div className="text-xs px-2" style={{ color: 'var(--text-300)' }}>None on file</div>
          ) : (
            companies.map(c => (
              <Option key={c.id} selected={is('company', c.id)} disabled={disabled} onClick={() => onFocus({ type: 'company', id: c.id, name: c.name })}>
                {c.name}
              </Option>
            ))
          )}
        </div>

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
          <p className="text-[11px] mt-1.5 px-2" style={{ color: 'var(--text-300)' }}>Each file is read with the message it was sent with; it isn't stored.</p>
        </div>
      </div>
    </aside>
  )
}
