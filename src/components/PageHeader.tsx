import LogoMark from './LogoMark'
import { ArrowLeft } from './icons'

// The bar at the top of every signed-in page: where "back" goes (when the
// page has somewhere to go back to), the wordmark, and the page's own
// actions on the right.

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-semibold text-[15px]" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }} translate="no">
        RegWay
      </span>
    </div>
  )
}

export default function PageHeader({ back, width = 'max-w-[1200px]', children }: { back?: { label: string; onClick: () => void }; width?: string; children?: React.ReactNode }) {
  return (
    <header className="glass-nav sticky top-0 z-40">
      <div className={`${width} mx-auto px-5 sm:px-8 h-16 flex items-center gap-4`}>
        {back && (
          <button onClick={back.onClick} className="btn-tool">
            <ArrowLeft size={15} weight="bold" aria-hidden="true" />
            {back.label}
          </button>
        )}
        <Wordmark />
        {children && <div className="ml-auto flex items-center gap-2 sm:gap-3">{children}</div>}
      </div>
    </header>
  )
}
