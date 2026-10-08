import LogoMark from './LogoMark'

// The same closing line on every page. It carries no links until there are
// pages for them to go to.
export default function SiteFooter({ width = 'max-w-[1200px]' }: { width?: string }) {
  return (
    <footer className="site-footer">
      <div className={`${width} mx-auto px-5 sm:px-8 py-5 flex flex-col sm:flex-row gap-x-6 gap-y-2 sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="text-xs" style={{ color: 'var(--text-400)' }}>
            <span className="num">© {new Date().getFullYear()}</span> RegWay. Regulatory intelligence for private markets.
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-300)' }}>Informational only. Not legal advice.</span>
      </div>
    </footer>
  )
}
