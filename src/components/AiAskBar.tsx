// The "Ask RegWay AI" input under a list (dashboard, fund and company pages).
// It doesn't send anything itself: focusing it opens the AI drawer, scoped
// to whatever the page is about. Sticky, so under a long list it stays at
// the bottom of the window instead of below the last item.

export default function AiAskBar({ placeholder, onOpen, style }: { placeholder: string; onOpen: () => void; style?: React.CSSProperties }) {
  return (
    <div className="max-w-2xl mx-auto sticky z-30" style={{ bottom: 24, ...style }}>
      <div className="relative">
        <input
          className="glass-input w-full py-5 px-7 pr-28 text-sm"
          // More opaque than the default glass, with a shadow: list items
          // scroll underneath it.
          style={{ fontSize: 14, color: 'var(--text-900)', background: 'rgb(var(--surface-rgb) / 0.94)', boxShadow: '0 10px 30px rgb(var(--ink-rgb) / 0.14)' }}
          placeholder={placeholder}
          readOnly
          onFocus={onOpen}
          onKeyDown={e => e.key === 'Enter' && onOpen()}
        />
        {/* Attachment — opens the AI drawer, where files can actually be attached */}
        <button
          onClick={onOpen}
          className="absolute right-14 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-sky-50 transition-colors"
          style={{ color: 'var(--text-300)' }}
          title="Attach a file"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 5L6.2 10.3a2 2 0 002.8 2.8l5.3-5.3a3.5 3.5 0 00-5-5L3.5 8.6a5 5 0 007 7L15 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Send */}
        <button
          onClick={onOpen}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white"
          style={{ background: 'linear-gradient(135deg,var(--brand),var(--brand-light))', borderRadius: 9999, boxShadow: '0 4px 12px rgb(var(--primary-rgb) / 0.30)' }}
          aria-label="Ask RegWay AI"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 2l3 6-3 6 12-6z" fill="white"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
