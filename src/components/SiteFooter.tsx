import LogoMark from './LogoMark'
import RouteLink from './RouteLink'

const LINKS = [
  { to: '/about', label: 'About' },
  { to: '/sources', label: 'Sources' },
  { to: '/legal', label: 'Legal' },
  { to: '/privacy', label: 'Privacy' },
]

// The same closing lines on every page: who this is, the public pages, and
// the reminder that none of it is legal advice.
export default function SiteFooter({ width = 'max-w-[1200px]' }: { width?: string }) {
  return (
    <footer className="site-footer">
      <div className={`${width} mx-auto px-5 sm:px-8 py-5 flex flex-col md:flex-row gap-x-8 gap-y-3 md:items-center`}>
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="text-xs" style={{ color: 'var(--text-400)' }}>
            <span className="num">© {new Date().getFullYear()}</span> RegWay. Regulatory intelligence for private markets.
          </span>
        </div>
        <nav aria-label="Site" className="flex flex-wrap gap-x-5 gap-y-1 md:ml-auto">
          {LINKS.map(link => (
            <RouteLink key={link.to} to={link.to} className="footer-link text-xs">
              {link.label}
            </RouteLink>
          ))}
        </nav>
        <span className="text-xs" style={{ color: 'var(--text-300)' }}>Informational only. Not legal advice.</span>
      </div>
    </footer>
  )
}
