import LogoMark from './LogoMark'

interface LandingPageProps {
  onGetStarted: () => void
  onSignIn: () => void
}

const FEATURES = [
  {
    title: 'Real regulatory data',
    description: 'Synced daily from the Federal Register — SEC, banking regulators, labor, tax, and more. Not a demo feed.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="3" y="2.5" width="12" height="13" rx="1.5" stroke="#0284C7" strokeWidth="1.3"/>
        <path d="M6 6.5h6M6 9h6M6 11.5h3.5" stroke="#0284C7" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    title: 'AI that filters, not floods',
    description: 'Claude evaluates every new rule against your actual jurisdictions, funds, and portfolio companies. Only genuine matches reach your dashboard.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2.5l1.6 3.6 3.9.4-2.9 2.7.8 3.8L9 11.1l-3.4 1.9.8-3.8-2.9-2.7 3.9-.4L9 2.5z" stroke="#0284C7" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    title: 'Built for PE structure',
    description: 'Organized the way your firm actually works: PE Firm, Fund Structure, Portfolio Companies — each with its own relevant feed.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2.5l6 3.2v6.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="#0284C7" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M9 9l6-3.2M9 9v6.5M9 9L3 5.8" stroke="#0284C7" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

export default function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Top nav */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-8 h-20 flex items-center">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="font-semibold text-base" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button className="btn-ghost" onClick={onSignIn}>Sign In</button>
            <button className="btn-primary" onClick={onGetStarted}>Get Started</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <div className="max-w-[900px] mx-auto text-center px-8" style={{ paddingTop: 96, paddingBottom: 80 }}>
          <div
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium mb-6"
            style={{ background: 'rgba(2,132,199,0.08)', color: '#0284C7', borderRadius: 9999, border: '1px solid rgba(2,132,199,0.15)' }}
          >
            AI-powered regulatory intelligence
          </div>
          <h1
            className="text-5xl font-semibold mb-6"
            style={{ color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            Regulatory intelligence that
            <br />
            actually knows your firm.
          </h1>
          <p className="text-lg max-w-[620px] mx-auto mb-10" style={{ color: '#64748B', lineHeight: 1.6 }}>
            RegWay watches real regulatory activity and filters it down to only what
            genuinely affects your firm, funds, and portfolio companies — not a
            firehose of noise.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button className="btn-primary" style={{ padding: '13px 28px', fontSize: 15 }} onClick={onGetStarted}>
              Get Started Free
            </button>
            <button className="btn-ghost" style={{ padding: '13px 28px', fontSize: 15 }} onClick={onSignIn}>
              Sign In
            </button>
          </div>
        </div>

        {/* Feature cards */}
        <div className="max-w-[1100px] mx-auto px-8" style={{ paddingBottom: 96 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="glass-card-light glass-lift" style={{ padding: 28 }}>
                <div
                  className="w-10 h-10 flex items-center justify-center mb-5"
                  style={{ background: 'rgba(2,132,199,0.08)', borderRadius: 10 }}
                >
                  {f.icon}
                </div>
                <div className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>{f.title}</div>
                <div className="text-sm" style={{ color: '#64748B', lineHeight: 1.6 }}>{f.description}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: 'rgba(255,255,255,0.60)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(186,230,253,0.30)',
        }}
      >
        <div className="max-w-[1200px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-sm font-semibold" style={{ color: '#334155' }}>RegWay</span>
            <span className="text-xs ml-2" style={{ color: '#94a3b8' }}>© 2026 · Regulatory intelligence for private markets</span>
          </div>
          <div className="flex items-center gap-6">
            {['About Us', 'Sources', 'Legal Disclaimers', 'Privacy Policy'].map(link => (
              <a
                key={link}
                href="#"
                className="text-xs hover:text-sky-600 transition-colors"
                style={{ color: '#64748B' }}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
