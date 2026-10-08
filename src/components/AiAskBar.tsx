// The "Ask RegWay AI" input under a list (dashboard, fund and company pages).
// It doesn't send anything itself: focusing it opens the AI drawer, scoped
// to whatever the page is about. Sticky, so under a long list it stays at
// the bottom of the window instead of below the last item.

import { PaperPlaneRight, Paperclip } from './icons'

export default function AiAskBar({ placeholder, onOpen, style }: { placeholder: string; onOpen: () => void; style?: React.CSSProperties }) {
  return (
    <div className="max-w-2xl mx-auto sticky z-30" style={{ bottom: 'max(24px, env(safe-area-inset-bottom))', ...style }}>
      <div className="relative">
        <input
          className="glass-input w-full py-[24px] pl-6 pr-28 text-ellipsis"
          // More opaque than the default glass, with a shadow: list items
          // scroll underneath it.
          style={{ fontSize: 15, color: 'var(--text-900)', background: 'rgb(var(--surface-rgb) / 0.94)', boxShadow: 'var(--shadow-float)' }}
          placeholder={placeholder}
          aria-label="Ask RegWay AI"
          name="ask"
          autoComplete="off"
          readOnly
          onFocus={onOpen}
          onKeyDown={e => e.key === 'Enter' && onOpen()}
        />
        {/* Attachment — opens the AI drawer, where files can actually be attached */}
        <button onClick={onOpen} className="btn-icon absolute right-14 top-1/2 -translate-y-1/2" title="Attach a file" aria-label="Attach a file">
          <Paperclip size={17} aria-hidden="true" />
        </button>
        {/* Send */}
        <button
          onClick={onOpen}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white transition-transform active:scale-95"
          style={{ background: 'linear-gradient(135deg,var(--brand),var(--brand-light))', borderRadius: 9999, boxShadow: '0 4px 12px rgb(var(--primary-rgb) / 0.30)' }}
          aria-label="Open RegWay AI"
        >
          <PaperPlaneRight size={17} weight="fill" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
