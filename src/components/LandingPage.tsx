import { useEffect, useRef } from 'react'
import LogoMark from './LogoMark'
import AuthPanel from './AuthPanel'
import Reveal from './Reveal'

// The public landing page. Signing in or creating an account happens here:
// the form slides out from behind the hero (see `.hero-row` in index.css)
// instead of switching to a separate screen. Sections below slide in from
// the sides as they scroll into view.

export type AuthMode = 'sign-in' | 'sign-up'

interface LandingPageProps {
  // The form showing, if any.
  authMode: AuthMode | null
  // Why the form was opened by the app (e.g. after a password change).
  notice?: string | null
  onOpenAuth: (mode: AuthMode) => void
  onCloseAuth: () => void
  onAuthenticated: () => void
}

const icon = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    {path}
  </svg>
)

const FEATURES = [
  {
    title: 'Real regulatory data',
    description: 'The Federal Register and regulators’ own announcements every 30 minutes (U.S., UK and EU), plus SEC and FINRA enforcement, sanctions, export controls, trade actions and State Department advisories. Not a demo feed.',
    icon: icon(
      <>
        <rect x="3" y="2.5" width="12" height="13" rx="1.5" stroke="#0284C7" strokeWidth="1.3" />
        <path d="M6 6.5h6M6 9h6M6 11.5h3.5" stroke="#0284C7" strokeWidth="1.3" strokeLinecap="round" />
      </>,
    ),
  },
  {
    title: 'AI that filters, not floods',
    description: 'Claude evaluates every new development against your actual jurisdictions, funds, and portfolio companies. Only genuine matches reach your dashboard, each with the reason it is there.',
    icon: icon(<path d="M9 2.5l1.6 3.6 3.9.4-2.9 2.7.8 3.8L9 11.1l-3.4 1.9.8-3.8-2.9-2.7 3.9-.4L9 2.5z" stroke="#0284C7" strokeWidth="1.3" strokeLinejoin="round" />),
  },
  {
    title: 'Built for PE structure',
    description: 'Organized the way your firm actually works: PE Firm, Fund Structure, Portfolio Companies, each with its own page of what was found for it, day by day.',
    icon: icon(
      <>
        <path d="M9 2.5l6 3.2v6.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="#0284C7" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9 9l6-3.2M9 9v6.5M9 9L3 5.8" stroke="#0284C7" strokeWidth="1.3" strokeLinejoin="round" />
      </>,
    ),
  },
]

const STEPS = [
  {
    title: 'Tell RegWay about your firm',
    body: 'Where the firm, its funds and its portfolio companies are, what they do, and who holds what. A few minutes, and you can finish it later.',
  },
  {
    title: 'RegWay watches the sources',
    body: 'New rules, proposed rules, enforcement actions and geopolitical measures are checked against what you told it, around the clock.',
  },
  {
    title: 'Open what was found today',
    body: "Each page opens on today's findings with why each one applies, a plain-language analysis, and RegWay AI to ask follow-up questions.",
  },
]

const SOURCES = ['Federal Register', 'SEC announcements', 'SEC litigation releases', 'SEC administrative proceedings', 'FINRA disciplinary actions', 'FTC', 'CFPB', 'OFAC sanctions', 'BIS export controls', 'USTR trade actions', 'State Department travel advisories', 'UK FCA', 'UK PRA', 'UK legislation', 'EU ESMA', 'EUR-Lex']

export default function LandingPage({ authMode, notice, onOpenAuth, onCloseAuth, onAuthenticated }: LandingPageProps) {
  const open = authMode !== null
  const authRef = useRef<HTMLDivElement>(null)

  // On narrow screens the form opens below the hero text: bring it into view.
  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 1024px)').matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    authRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  }, [open, authMode])

  // From further down the page: back to the top, where the form opens.
  const startFromBelow = (mode: AuthMode) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    onOpenAuth(mode)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Top nav */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-20 flex items-center">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="font-semibold text-base" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button className="btn-ghost whitespace-nowrap" onClick={() => onOpenAuth('sign-in')}>Sign In</button>
            {/* On a phone the hero's own button is right below. */}
            <button className="btn-primary whitespace-nowrap hidden sm:inline-block" onClick={() => onOpenAuth('sign-up')}>Get Started</button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero, with the sign-in / sign-up form beside it when open */}
        <section className="max-w-[1200px] mx-auto px-5 sm:px-8" style={{ paddingTop: 96, paddingBottom: 80 }}>
          <div className={`hero-row ${open ? 'is-open' : ''}`}>
            <div className="hero-copy">
              <div
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium mb-6"
                style={{ background: 'rgba(2,132,199,0.08)', color: '#0284C7', borderRadius: 9999, border: '1px solid rgba(2,132,199,0.15)' }}
              >
                AI-powered regulatory intelligence
              </div>
              <h1 className="text-4xl sm:text-5xl font-semibold mb-6" style={{ color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                Regulatory intelligence that actually knows your firm.
              </h1>
              <p className="text-lg mx-auto mb-10" style={{ color: '#64748B', lineHeight: 1.6, maxWidth: 620 }}>
                RegWay watches real regulatory activity and filters it down to only what genuinely affects your firm, funds, and portfolio companies — not a firehose of noise.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button className="btn-primary" style={{ padding: '13px 28px', fontSize: 15 }} onClick={() => onOpenAuth('sign-up')}>
                  Get Started Free
                </button>
                <button className="btn-ghost" style={{ padding: '13px 28px', fontSize: 15 }} onClick={() => onOpenAuth('sign-in')}>
                  Sign In
                </button>
              </div>
            </div>

            <div className="hero-auth" ref={authRef} aria-hidden={!open}>
              {authMode && <AuthPanel key={authMode} initialMode={authMode} notice={notice} onClose={onCloseAuth} onAuthenticated={onAuthenticated} />}
            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section className="max-w-[1100px] mx-auto px-5 sm:px-8" style={{ paddingBottom: 112 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} from={i === 0 ? 'left' : i === 2 ? 'right' : 'up'} delay={i * 90}>
                <div className="glass-card-light glass-lift h-full" style={{ padding: 28 }}>
                  <div className="w-10 h-10 flex items-center justify-center mb-5" style={{ background: 'rgba(2,132,199,0.08)', borderRadius: 10 }}>
                    {f.icon}
                  </div>
                  <div className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>{f.title}</div>
                  <div className="text-sm" style={{ color: '#64748B', lineHeight: 1.6 }}>{f.description}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works: steps slide in from alternating sides */}
        <section className="max-w-[900px] mx-auto px-5 sm:px-8" style={{ paddingBottom: 112 }}>
          <Reveal from="up">
            <h2 className="text-3xl font-semibold text-center mb-12" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>How it works</h2>
          </Reveal>
          <div className="space-y-6">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} from={i % 2 === 0 ? 'left' : 'right'}>
                <div className={`glass-card-light flex items-start gap-5 md:w-[78%] ${i % 2 === 0 ? '' : 'md:ml-auto'}`} style={{ padding: 28 }}>
                  <div
                    className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 9999 }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-base font-semibold mb-1.5" style={{ color: '#0F172A' }}>{step.title}</div>
                    <div className="text-sm" style={{ color: '#64748B', lineHeight: 1.6 }}>{step.body}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Sources */}
        <section className="max-w-[900px] mx-auto px-5 sm:px-8 text-center" style={{ paddingBottom: 112 }}>
          <Reveal from="up">
            <h2 className="text-2xl font-semibold mb-3" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>What RegWay watches</h2>
            <p className="text-sm mb-8" style={{ color: '#64748B' }}>Official sources only, plus a targeted web search for each portfolio company.</p>
          </Reveal>
          <div className="flex flex-wrap justify-center gap-2.5">
            {SOURCES.map((s, i) => (
              <Reveal key={s} from={i % 2 === 0 ? 'left' : 'right'} delay={i * 50}>
                <span className="inline-block px-4 py-2 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(186,230,253,0.55)', color: '#334155', borderRadius: 9999 }}>
                  {s}
                </span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Closing call to action */}
        <section className="max-w-[900px] mx-auto px-5 sm:px-8" style={{ paddingBottom: 112 }}>
          <Reveal from="up">
            <div className="glass-card-light text-center" style={{ padding: '48px 32px' }}>
              <h2 className="text-2xl font-semibold mb-3" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>See what affects your firm today.</h2>
              <p className="text-sm mb-8" style={{ color: '#64748B' }}>Set up takes a few minutes. Your first findings arrive the same day.</p>
              <button className="btn-primary" style={{ padding: '13px 28px', fontSize: 15 }} onClick={() => startFromBelow('sign-up')}>
                Get Started Free
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ background: 'rgba(255,255,255,0.60)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(186,230,253,0.30)' }}>
        <div className="max-w-[1200px] mx-auto px-8 py-5 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-sm font-semibold" style={{ color: '#334155' }}>RegWay</span>
            <span className="text-xs ml-2" style={{ color: '#94a3b8' }}>© 2026 · Regulatory intelligence for private markets</span>
          </div>
          <div className="flex items-center gap-6">
            {['About Us', 'Sources', 'Legal Disclaimers', 'Privacy Policy'].map(link => (
              <a key={link} href="#" className="text-xs hover:text-sky-600 transition-colors" style={{ color: '#64748B' }}>
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
