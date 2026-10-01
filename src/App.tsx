import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { getFirmId, getCachedFirmId } from './lib/data'
import { bindCacheToUser, clearCache } from './lib/cache'
import AuthScreen from './components/AuthScreen'
import LandingPage from './components/LandingPage'
import ProfileScreen, { type ProfileTab } from './components/ProfileScreen'
import OnboardingModal from './components/OnboardingModal'
import ResetPasswordScreen from './components/ResetPasswordScreen'
import Dashboard from './components/Dashboard'
import RegWayAICopilot from './components/RegWayAICopilot'
import HeadlineDetailView from './components/HeadlineDetailView'
import type { Regulation, AiContext } from './lib/types'
import LogoMark from './components/LogoMark'

type View = 'loading' | 'landing' | 'auth' | 'reset-password' | 'onboarding' | 'dashboard' | 'detail' | 'profile' | 'ai'

export default function App() {
  const [view, setView] = useState<View>('loading')
  const [profileTab, setProfileTab] = useState<ProfileTab>('account')
  const [profileFocus, setProfileFocus] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-up')
  const [detailPayload, setDetailPayload] = useState<unknown>(null)
  const [showAI, setShowAI] = useState(false)
  const [aiContext, setAiContext] = useState<AiContext | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        if (mounted) setView('landing')
        return
      }
      bindCacheToUser(session.user.id)
      // A known firm means we can show the dashboard straight away and
      // confirm in the background, instead of a "Loading…" screen every visit.
      if (getCachedFirmId() && mounted) setView('dashboard')
      const firmId = await getFirmId().catch(() => getCachedFirmId())
      if (mounted) setView(firmId ? 'dashboard' : 'onboarding')
    }
    init()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // Fires when the client parses a password-recovery link's token from
      // the URL — takes priority over the normal signed-in routing below.
      if (event === 'PASSWORD_RECOVERY') {
        if (mounted) setView('reset-password')
        return
      }
      if (!session) {
        clearCache()
        setView('landing')
      }
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const goToAuth = (mode: 'sign-in' | 'sign-up') => {
    setAuthMode(mode)
    setView('auth')
  }

  const navigate = (newView: View, payload?: unknown) => {
    if (newView === 'ai') {
      setShowAI(true)
      setAiContext((payload as AiContext | undefined) ?? null)
      return
    }
    if (newView === 'profile') {
      const p = payload as { tab?: ProfileTab; focusId?: string | null } | undefined
      setProfileTab(p?.tab ?? 'account')
      setProfileFocus(p?.focusId ?? null)
    }
    else if (payload) setDetailPayload(payload)
    setView(newView)
  }

  const handleAuthenticated = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) bindCacheToUser(session.user.id)
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

        {view === 'landing' && (
          <LandingPage onGetStarted={() => goToAuth('sign-up')} onSignIn={() => goToAuth('sign-in')} />
        )}

        {view === 'auth' && (
          <AuthScreen
            onAuthenticated={handleAuthenticated}
            initialMode={authMode}
            onBack={() => setView('landing')}
          />
        )}

        {view === 'reset-password' && (
          <ResetPasswordScreen onDone={handleAuthenticated} />
        )}

        {view === 'onboarding' && (
          <>
            {/* Landing behind modal */}
            <div className="min-h-screen flex items-center justify-center" style={{ padding: 24 }}>
              <div className="text-center max-w-md">
                <LogoMark size={64} />
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
            onAskAI={ctx => navigate('ai', ctx)}
          />
        )}

        {view === 'profile' && (
          <ProfileScreen onBack={() => setView('dashboard')} initialTab={profileTab} focusId={profileFocus} />
        )}
      </div>

      {/* RegWay AI drawer — rendered over any view */}
      {showAI && (
        <RegWayAICopilot context={aiContext} onClose={() => { setShowAI(false); setAiContext(null) }} />
      )}
    </div>
  )
}
