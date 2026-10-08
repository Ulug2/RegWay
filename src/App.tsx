import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { getFirmId, getCachedFirmId, getCachedFirm, fetchFirm, fetchFunds, fetchPortfolioCompanies } from './lib/data'
import { bindCacheToUser, clearCache } from './lib/cache'
import LandingPage from './components/LandingPage'
import ProfileScreen, { type ProfileTab } from './components/ProfileScreen'
import OnboardingModal from './components/OnboardingModal'
import ResetPasswordScreen from './components/ResetPasswordScreen'
import Dashboard from './components/Dashboard'
import EntityPage, { type EntityRef } from './components/EntityPage'
import RegWayAICopilot from './components/RegWayAICopilot'
import HeadlineDetailView from './components/HeadlineDetailView'
import type { Regulation, AiContext } from './lib/types'
import LogoMark from './components/LogoMark'

type View = 'loading' | 'landing' | 'auth' | 'reset-password' | 'onboarding' | 'dashboard' | 'detail' | 'profile' | 'ai' | 'entity'

export default function App() {
  const [view, setView] = useState<View>('loading')
  const [profileTab, setProfileTab] = useState<ProfileTab>('account')
  const [profileFocus, setProfileFocus] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-up')
  const [detailPayload, setDetailPayload] = useState<unknown>(null)
  // The fund or company page open (or last open), and where the detail and
  // profile views go back to: the page they were opened from.
  const [entity, setEntity] = useState<EntityRef | null>(null)
  const [returnTo, setReturnTo] = useState<'dashboard' | 'entity'>('dashboard')
  // A page opens at its top. Going back to a list returns to where the
  // list was left, not to wherever the page in between was scrolled.
  const leftAt = useRef(0)
  const restoreTo = useRef<number | null>(null)
  const goBack = () => {
    restoreTo.current = leftAt.current
    setView(returnTo === 'entity' && entity ? 'entity' : 'dashboard')
  }
  useLayoutEffect(() => {
    window.scrollTo(0, restoreTo.current ?? 0)
    restoreTo.current = null
  }, [view, entity?.type, entity?.id])
  const [showAI, setShowAI] = useState(false)
  const [aiContext, setAiContext] = useState<AiContext | null>(null)
  // A password-recovery link signs the user in *and* asks for a new
  // password. While that's pending, the ordinary signed-in routing must not
  // take over the screen (it used to: the reset form flashed, then the
  // dashboard replaced it). Read from the URL up front because the auth
  // client strips the link's parameters as soon as it has parsed them.
  // Shown on the sign-in form after the app signs the user out on purpose
  // (a new password was just set from a reset link). A ref as well as state: the auth listener below is created once
  // and needs the current value to route to sign-in instead of the landing page.
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const authNoticeRef = useRef<string | null>(null)
  const recovering = useRef(/[#&?]type=recovery\b/.test(window.location.hash + window.location.search))

  // The dashboard greets the user by name and counts their funds and
  // companies. Have those in hand before it shows, so nothing on it is seen
  // changing from a placeholder. A failure here only means it fills in late.
  const loadFirm = (firmId: string) => Promise.all([fetchFirm(firmId), fetchFunds(firmId), fetchPortfolioCompanies(firmId)]).catch(() => {})

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
      if (recovering.current) {
        if (mounted) setView('reset-password')
        return
      }
      // A known firm means we can show the dashboard straight away and
      // confirm in the background, instead of a "Loading…" screen every visit.
      if (getCachedFirmId() && getCachedFirm() && mounted) setView('dashboard')
      const firmId = await getFirmId().catch(() => getCachedFirmId())
      if (firmId && !getCachedFirm()) await loadFirm(firmId)
      if (mounted && !recovering.current) setView(firmId ? 'dashboard' : 'onboarding')
    }
    init()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // Fires when the client parses a password-recovery link's token from
      // the URL — takes priority over the normal signed-in routing below.
      if (event === 'PASSWORD_RECOVERY') {
        recovering.current = true
        if (mounted) setView('reset-password')
        return
      }
      if (!session) {
        clearCache()
        if (authNoticeRef.current) setAuthMode('sign-in')
        setView(authNoticeRef.current ? 'auth' : 'landing')
      }
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  // Signs the user out everywhere and lands them on sign-in with `notice`.
  const signOutWithNotice = async (notice: string) => {
    authNoticeRef.current = notice
    setAuthNotice(notice)
    recovering.current = false
    await supabase.auth.signOut()
  }

  const clearAuthNotice = () => {
    authNoticeRef.current = null
    setAuthNotice(null)
  }

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
    else if (newView === 'entity') setEntity(payload as EntityRef)
    else if (payload) setDetailPayload(payload)
    if (newView === 'detail' || newView === 'profile') {
      setReturnTo(view === 'entity' ? 'entity' : 'dashboard')
      leftAt.current = window.scrollY
    }
    setView(newView)
  }

  const handleAuthenticated = async () => {
    clearAuthNotice()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) bindCacheToUser(session.user.id)
    const firmId = await getFirmId().catch(() => null)
    if (firmId) await loadFirm(firmId)
    setView(firmId ? 'dashboard' : 'onboarding')
  }

  return (
    <div
      className="relative min-h-[100dvh] overflow-x-clip"
      style={{ background: 'var(--canvas)' }}
    >

      {/* Main content above spheres */}
      <div className="relative" style={{ zIndex: 1 }}>
        {view === 'loading' && (
          <div className="min-h-[100dvh] flex items-center justify-center" role="status">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-pulse"><LogoMark size={40} /></div>
              <div className="text-sm" style={{ color: 'var(--text-400)' }}>Loading…</div>
            </div>
          </div>
        )}

        {/* The landing page hosts sign-in / sign-up: 'auth' is the same page with the form open. */}
        {(view === 'landing' || view === 'auth') && (
          <LandingPage
            authMode={view === 'auth' ? authMode : null}
            notice={authNotice}
            onOpenAuth={goToAuth}
            onCloseAuth={() => { clearAuthNotice(); setView('landing') }}
            onAuthenticated={handleAuthenticated}
          />
        )}

        {view === 'reset-password' && (
          <ResetPasswordScreen onDone={() => signOutWithNotice('Password updated. Sign in with your new password.')} />
        )}

        {view === 'onboarding' && (
          <>
            {/* Landing behind modal */}
            <div className="min-h-[100dvh] flex items-center justify-center" style={{ padding: 24 }}>
              <div className="text-center max-w-md">
                <div className="flex justify-center mb-4"><LogoMark size={64} /></div>
                <h1
                  className="text-3xl font-semibold mb-2"
                  style={{ color: 'var(--text-900)', letterSpacing: '-0.03em' }}
                >
                  RegWay
                </h1>
                <p className="text-base" style={{ color: 'var(--text-400)' }}>
                  Regulatory intelligence for private equity firms and their portfolios.
                </p>
              </div>
            </div>
            <OnboardingModal onComplete={handleAuthenticated} />
          </>
        )}

        {view === 'dashboard' && (
          <Dashboard onNavigate={navigate} />
        )}

        {view === 'entity' && entity && (
          <EntityPage key={`${entity.type}:${entity.id}`} entity={entity} onNavigate={navigate} />
        )}

        {view === 'detail' && (
          <HeadlineDetailView
            onBack={goBack}
            backLabel={returnTo === 'entity' && entity ? 'Back' : 'Back to Dashboard'}
            headline={detailPayload as Partial<Regulation> | undefined}
            onAskAI={ctx => navigate('ai', ctx)}
          />
        )}

        {view === 'profile' && (
          <ProfileScreen onBack={goBack} backLabel={returnTo === 'entity' && entity ? 'Back' : 'Back to Dashboard'} initialTab={profileTab} focusId={profileFocus} />
        )}
      </div>

      {/* RegWay AI drawer — rendered over any view */}
      {showAI && (
        <RegWayAICopilot context={aiContext} onClose={() => { setShowAI(false); setAiContext(null) }} />
      )}
    </div>
  )
}
