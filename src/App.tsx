import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { getFirmId } from './lib/data'
import AuthScreen from './components/AuthScreen'
import OnboardingModal from './components/OnboardingModal'
import Dashboard from './components/Dashboard'
import HarveyAICopilot from './components/HarveyAICopilot'
import HeadlineDetailView from './components/HeadlineDetailView'
import type { Regulation } from './lib/types'

type View = 'loading' | 'auth' | 'onboarding' | 'dashboard' | 'detail' | 'harvey'

export default function App() {
  const [view, setView] = useState<View>('loading')
  const [detailPayload, setDetailPayload] = useState<unknown>(null)
  const [showHarvey, setShowHarvey] = useState(false)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        if (mounted) setView('auth')
        return
      }
      const firmId = await getFirmId().catch(() => null)
      if (mounted) setView(firmId ? 'dashboard' : 'onboarding')
    }
    init()

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setView('auth')
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const navigate = (newView: View, payload?: unknown) => {
    if (newView === 'harvey') {
      setShowHarvey(true)
      return
    }
    if (payload) setDetailPayload(payload)
    setView(newView)
  }

  const handleAuthenticated = async () => {
    const firmId = await getFirmId().catch(() => null)
    setView(firmId ? 'dashboard' : 'onboarding')
  }

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: '#FDFBF7', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Ambient radial sphere 1 — sky blue */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-200px',
          right: '-100px',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(186,230,253,0.55) 0%, rgba(224,242,254,0.25) 50%, transparent 75%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* Ambient radial sphere 2 — ice blue */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: '-150px',
          left: '-150px',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(224,242,254,0.60) 0%, rgba(186,230,253,0.20) 50%, transparent 72%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* Ambient radial sphere 3 — warm center accent */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '40%',
          left: '35%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(186,230,253,0.20) 0%, transparent 70%)',
          filter: 'blur(90px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Main content above spheres */}
      <div className="relative" style={{ zIndex: 1 }}>
        {view === 'loading' && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-sm" style={{ color: '#64748B' }}>Loading…</div>
          </div>
        )}

        {view === 'auth' && <AuthScreen onAuthenticated={handleAuthenticated} />}

        {view === 'onboarding' && (
          <>
            {/* Landing behind modal */}
            <div className="min-h-screen flex items-center justify-center" style={{ padding: 24 }}>
              <div className="text-center max-w-md">
                <div
                  className="w-16 h-16 flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 20 }}
                >
                  <svg width="32" height="32" viewBox="0 0 18 18" fill="none">
                    <path d="M9 2L3 6v6l6 4 6-4V6L9 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M9 2v10M3 6l6 4 6-4" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1
                  className="text-3xl font-semibold mb-2"
                  style={{ color: '#0F172A', letterSpacing: '-0.03em' }}
                >
                  RegWay
                </h1>
                <p className="text-base" style={{ color: '#64748B' }}>
                  AI-powered regulatory intelligence for private equity and general partners.
                </p>
              </div>
            </div>
            <OnboardingModal onComplete={() => setView('dashboard')} />
          </>
        )}

        {view === 'dashboard' && (
          <Dashboard onNavigate={navigate} />
        )}

        {view === 'detail' && (
          <HeadlineDetailView
            onBack={() => setView('dashboard')}
            headline={detailPayload as Partial<Regulation> | undefined}
          />
        )}
      </div>

      {/* Harvey AI drawer — rendered over any view */}
      {showHarvey && (
        <HarveyAICopilot onClose={() => setShowHarvey(false)} />
      )}
    </div>
  )
}
