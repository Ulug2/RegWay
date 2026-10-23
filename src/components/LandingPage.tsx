import { useEffect, useRef } from 'react'
import AuthPanel from './AuthPanel'
import Reveal from './Reveal'
import { SOURCES } from '../lib/sourceList'
import SiteFooter from './SiteFooter'
import { Wordmark } from './PageHeader'
import { FileText, Funnel, TreeStructure } from './icons'

// The public landing page. Signing in or creating an account happens here:
// the form takes the place of the product picture beside the hero (see
// `.hero-grid` in index.css) instead of switching to a separate screen.
// Sections below fade up as they scroll into view.

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

const FEATURES = [
  {
    Icon: FileText,
    title: 'Real regulatory data',
    description: 'The Federal Register and regulators’ own announcements every 30 minutes (U.S., UK and EU), plus SEC and FINRA enforcement, sanctions, export controls, trade actions and State Department advisories. Not a demo feed.',
  },
  {
    Icon: Funnel,
    title: 'AI that filters, not floods',
    description: 'RegWay AI evaluates every new development against your actual jurisdictions, funds, and portfolio companies. Only genuine matches reach your dashboard, each with the reason it is there.',
  },
  {
    Icon: TreeStructure,
    title: 'Built for PE structure',
    description: 'Organized the way your firm actually works: General Partners, Funds, Portfolio Companies, each with its own page of what was found for it, day by day.',
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

const SECTION = 'max-w-[1200px] mx-auto px-5 sm:px-8'
const H2 = 'text-[28px] sm:text-[32px] font-semibold'
const h2Style = { color: 'var(--text-900)', letterSpacing: '-0.03em', lineHeight: 1.15 }

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
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="glass-nav sticky top-0 z-40">
        <div className={`${SECTION} h-16 flex items-center`}>
          <Wordmark size={30} />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button className="btn-ghost btn-sm" onClick={() => onOpenAuth('sign-in')}>Sign In</button>
            {/* On a phone the hero's own button is right below. */}
            <button className="btn-primary btn-sm hidden sm:inline-flex" onClick={() => onOpenAuth('sign-up')}>Get Started</button>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* Hero: the sign-in / sign-up form takes the picture's place when open */}
        <section className={`${SECTION} pt-12 pb-20 sm:pt-16 lg:pt-20 lg:pb-28`}>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="text-sm font-medium mb-5" style={{ color: 'var(--primary)' }}>For private equity firms and their portfolios</p>
              <h1 className="text-[34px] sm:text-[40px] lg:text-[36px] xl:text-[44px] font-semibold mb-6" style={{ color: 'var(--text-900)', letterSpacing: '-0.04em', lineHeight: 1.08 }}>
                Regulatory intelligence that actually knows your firm.
              </h1>
              <p className="text-lg mb-9" style={{ color: 'var(--text-400)', lineHeight: 1.6, maxWidth: '34rem' }}>
                RegWay reads new rules, enforcement actions and sanctions, and shows only what affects your firm, funds and portfolio companies.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button className="btn-primary btn-lg" onClick={() => onOpenAuth('sign-up')}>Get Started</button>
                <button className="btn-ghost btn-lg" onClick={() => onOpenAuth('sign-in')}>Sign In</button>
              </div>
            </div>

            <div className={`hero-side ${open ? 'is-open' : ''}`}>
              <figure className="hero-shot" aria-hidden={open}>
                <div className="shot-frame">
                  <img className="shot-light" src="/landing/company-light.jpg" width={1440} height={1600} alt="A portfolio company's page in RegWay: two developments found today, each with the reason it applies to the company." fetchPriority="high" />
                  <img className="shot-dark" src="/landing/company-dark.jpg" width={1440} height={1600} alt="A portfolio company's page in RegWay: two developments found today, each with the reason it applies to the company." loading="lazy" />
                </div>
                <figcaption className="text-xs mt-3 text-center" style={{ color: 'var(--text-300)' }}>A portfolio company's page, shown with example data.</figcaption>
              </figure>
              <div className="hero-auth" ref={authRef} aria-hidden={!open}>
                {authMode && <AuthPanel key={authMode} initialMode={authMode} notice={notice} onClose={onCloseAuth} onAuthenticated={onAuthenticated} />}
              </div>
            </div>
          </div>
        </section>

        {/* What it is: a statement on the left, the three reasons on the right */}
        <section className={`${SECTION} pb-24 lg:pb-32`}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-16 gap-y-10">
            <Reveal className="lg:col-span-5">
              <h2 className={H2} style={h2Style}>Less to read. Nothing that matters missed.</h2>
              <p className="text-base mt-4" style={{ color: 'var(--text-400)', lineHeight: 1.65, maxWidth: '26rem' }}>
                Most of what regulators publish has nothing to do with you. RegWay does the reading and keeps the part that does.
              </p>
            </Reveal>
            <div className="lg:col-span-7">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 90}>
                  <div className="flex gap-5 py-7" style={{ borderTop: '1px solid rgb(var(--line-strong-rgb) / 0.45)' }}>
                    <div className="tile w-10 h-10" aria-hidden="true">
                      <f.Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-semibold mb-1.5" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>{f.title}</h3>
                      <p className="text-[15px]" style={{ color: 'var(--text-400)', lineHeight: 1.65, maxWidth: '65ch' }}>{f.description}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works: three steps in a row */}
        <section className={`${SECTION} pb-24 lg:pb-32`}>
          <Reveal>
            <h2 className={`${H2} mb-10`} style={h2Style}>How it works</h2>
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-8">
              {STEPS.map((step, i) => (
                <li key={step.title} className="pt-5" style={{ borderTop: '2px solid var(--primary)' }}>
                  <div className="mono text-sm font-medium mb-4" style={{ color: 'var(--primary)' }} aria-hidden="true">{i + 1}</div>
                  <h3 className="text-[17px] font-semibold mb-2" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>{step.title}</h3>
                  <p className="text-[15px]" style={{ color: 'var(--text-400)', lineHeight: 1.65 }}>{step.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* Sources, grouped by where they are */}
        <section id="sources" className={`${SECTION} pb-24 lg:pb-32`} style={{ scrollMarginTop: 96 }}>
          <Reveal>
            <div className="glass-card-light p-7 sm:p-10">
              <h2 className={H2} style={h2Style}>What RegWay watches</h2>
              <p className="text-base mt-3 mb-9" style={{ color: 'var(--text-400)', lineHeight: 1.6 }}>Official sources only, plus a targeted web search for each portfolio company.</p>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-x-10 gap-y-8">
                {SOURCES.map(group => (
                  <div key={group.region}>
                    <h3 className="section-label mb-3">{group.region}</h3>
                    <ul className={`text-sm space-y-2 ${group.names.length > 6 ? 'sm:columns-2 sm:gap-x-8' : ''}`} style={{ color: 'var(--text-600)' }}>
                      {group.names.map(name => (
                        <li key={name} style={{ breakInside: 'avoid' }}>{name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* Closing call to action */}
        <section className={`${SECTION} pb-24 lg:pb-32`}>
          <Reveal>
            <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10 px-7 py-9 sm:px-10 sm:py-11" style={{ borderRadius: 'var(--r-card)', background: 'rgb(var(--primary-rgb) / 0.07)', border: '1px solid rgb(var(--primary-rgb) / 0.16)' }}>
              <div className="flex-1 min-w-0">
                <h2 className={H2} style={h2Style}>See what affects your firm today.</h2>
                <p className="text-base mt-3" style={{ color: 'var(--text-500)', lineHeight: 1.6 }}>Set up takes a few minutes. Your first findings arrive the same day.</p>
              </div>
              <button className="btn-primary btn-lg self-start md:self-auto" onClick={() => startFromBelow('sign-up')}>Get Started</button>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
