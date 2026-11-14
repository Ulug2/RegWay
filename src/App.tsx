import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { getFirmId, getCachedFirmId, getCachedFirm, fetchFirm, fetchFunds, fetchPortfolioCompanies, fetchHoldings, fetchRegulation } from './lib/data'
import { bindCacheToUser, clearCache, readCache, writeCache } from './lib/cache'
import { detailPath, entityPath, historyIndex, onGo, parsePath, profilePath, pushPath, replacePath, type PageSlug } from './lib/router'
import InfoPage from './components/InfoPage'
import LandingPage from './components/LandingPage'
import ResetPasswordScreen from './components/ResetPasswordScreen'
import type { ProfileTab } from './components/ProfileScreen'
import type { EntityRef } from './components/EntityPage'
import type { Regulation, AiContext } from './lib/types'
import LogoMark from './components/LogoMark'
import { lazyScreen } from './lib/lazyScreen'

const ProfileScreen = lazyScreen(() => import('./components/ProfileScreen'))
const OnboardingModal = lazyScreen(() => import('./components/OnboardingModal'))
const Dashboard = lazyScreen(() => import('./components/Dashboard'))
const EntityPage = lazyScreen(() => import('./components/EntityPage'))
const RegWayAICopilot = lazyScreen(() => import('./components/RegWayAICopilot'))
const HeadlineDetailView = lazyScreen(() => import('./components/HeadlineDetailView'))

type View = 'loading' | 'landing' | 'auth' | 'reset-password' | 'onboarding' | 'dashboard' | 'detail' | 'profile' | 'ai' | 'entity' | 'page'

function ScreenLoadingFallback() {
  return (
    <div className="min-h-[100dvh]" role="status" aria-label="Loading screen" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        <div className="mb-10 flex items-center justify-between">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-9 w-9 rounded-full" />
        </div>
        <main aria-hidden="true" className="mx-auto max-w-2xl">
          <div className="skeleton mb-4 h-4 w-24" />
          <div className="skeleton mb-8 h-8 w-2/3" />
          {[0, 1, 2, 3].map(row => (
            <div key={row} className="glass-card mb-4 space-y-3 p-5">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-5 w-5/6" />
              <div className="skeleton h-3.5 w-full" />
              <div className="skeleton h-3.5 w-2/3" />
            </div>
          ))}
        </main>
      </div>
    </div>
  )
}

function ChatLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="status" aria-label="Loading chat" style={{ background: 'var(--canvas)' }}>
      <div className="flex items-center justify-between border-b p-5" style={{ borderColor: 'rgba(var(--line-rgb), 0.16)' }}>
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-9 w-9 rounded-full" />
      </div>
      <div aria-hidden="true" className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end gap-5 px-5 py-8">
        <div className="glass-card space-y-3 p-5">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-4/5" />
        </div>
        <div className="skeleton h-14 w-full rounded-xl" />
      </div>
    </div>
  )
}

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
  // The browser's Back does the same (see the popstate handler below): each
  // history entry remembers its scroll position when it is left.
  const restoreTo = useRef<number | null>(null)
  const [page, setPage] = useState<PageSlug>('about')
  useLayoutEffect(() => {
    window.scrollTo(0, restoreTo.current ?? 0)
    restoreTo.current = null
  }, [view, entity?.type, entity?.id, page])
  // Whether anyone is signed in, and with a firm: decides what an address
  // shows. A ref, because the listeners below are created once.
  const auth = useRef<'unknown' | 'out' | 'in' | 'onboarding'>('unknown')
  // A signed-in page asked for while signed out: shown after signing in.
  const pendingPath = useRef<string | null>(null)
  // Whether this visit has had a session at all (a reset link has one too).
  const hadSession = useRef(false)
  const [showAI, setShowAI] = useState(false)
  // An answer still being written when the chat is closed carries on out of
  // sight (and is saved when it finishes); reopening the chat returns to it.
  const [aiBusy, setAiBusy] = useState(false)
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

  // Shows the screen an address stands for (src/lib/router.ts).
  const showRoute = (path: string) => {
    if (recovering.current || auth.current === 'unknown') return
    const route = parsePath(path)
    // The public pages are for everyone, signed in or not.
    if (route.name === 'page') {
      setPage(route.slug)
      setView('page')
      return
    }
    if (auth.current === 'onboarding') return setView('onboarding')
    if (auth.current === 'out') {
      if (route.name === 'auth') {
        setAuthMode(route.mode)
        return setView('auth')
      }
      if (route.name === 'home' || route.name === 'unknown') {
        if (route.name === 'unknown') replacePath('/')
        return setView(authNoticeRef.current ? 'auth' : 'landing')
      }
      // A signed-in page: sign in first, then go there.
      pendingPath.current = path
      setAuthMode('sign-in')
      return setView('auth')
    }
    if (route.name === 'profile') {
      setProfileTab(route.tab)
      setProfileFocus(null)
      return setView('profile')
    }
    if (route.name === 'entity') {
      setEntity({ type: route.type, id: route.id })
      return setView('entity')
    }
    if (route.name === 'detail') {
      const known = readCache<Partial<Regulation>>(`ui:detail:${route.id}`)
      if (known) {
        setDetailPayload(known)
        return setView('detail')
      }
      // Opened from a link or after a reload: fetch the development itself.
      setView('loading')
      fetchRegulation(route.id)
        .then(found => {
          if (window.location.pathname !== path) return
          if (!found) throw new Error('not found')
          setDetailPayload(found)
          setView('detail')
        })
        .catch(() => {
          if (window.location.pathname !== path) return
          replacePath('/')
          setView('dashboard')
        })
      return
    }
    if (route.name !== 'home') replacePath('/')
    setView('dashboard')
  }

  // Back, as a button in the app: the browser's own Back when the previous
  // screen was this app's, otherwise up to the page this one belongs under
  // (a development opened from a link has no previous screen).
  const goBack = () => {
    if (historyIndex() > 0) return window.history.back()
    const parent = returnTo === 'entity' && entity ? entityPath(entity) : '/'
    replacePath(parent)
    showRoute(parent)
  }

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    const onPop = (e: PopStateEvent) => {
      restoreTo.current = (e.state as { scroll?: number } | null)?.scroll ?? null
      showRoute(window.location.pathname)
    }
    window.addEventListener('popstate', onPop)
    const offGo = onGo(path => {
      pushPath(path)
      window.scrollTo(0, 0)
      showRoute(path)
    })
    return () => {
      window.removeEventListener('popstate', onPop)
      offGo()
    }
    // showRoute reads only refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The dashboard greets the user by name and counts their funds and
  // companies. Have those in hand before it shows, so nothing on it is seen
  // changing from a placeholder. A failure here only means it fills in late.
  const loadFirm = (firmId: string) => Promise.all([fetchFirm(firmId), fetchFunds(firmId), fetchPortfolioCompanies(firmId), fetchHoldings(firmId)]).catch(() => {})

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        auth.current = 'out'
        if (mounted) showRoute(window.location.pathname)
        return
      }
      hadSession.current = true
      bindCacheToUser(session.user.id)
      if (recovering.current) {
        if (mounted) setView('reset-password')
        return
      }
      // A known firm means we can show the dashboard straight away and
      // confirm in the background, instead of a "Loading…" screen every visit.
      const shownFromCache = !!getCachedFirmId() && !!getCachedFirm()
      if (shownFromCache && mounted) {
        auth.current = 'in'
        showRoute(window.location.pathname)
      }
      const firmId = await getFirmId().catch(() => getCachedFirmId())
      if (firmId && !getCachedFirm()) await loadFirm(firmId)
      // Already showing from the cache: bring the holdings in behind it.
      else if (firmId) fetchHoldings(firmId).catch(() => {})
      if (!mounted || recovering.current) return
      auth.current = firmId ? 'in' : 'onboarding'
      if (!firmId || !shownFromCache) showRoute(window.location.pathname)
    }
    init()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // Fires when the client parses a password-recovery link's token from
      // the URL — takes priority over the normal signed-in routing below.
      if (event === 'PASSWORD_RECOVERY') {
        hadSession.current = true
        recovering.current = true
        if (mounted) setView('reset-password')
        return
      }
      if (!session) {
        // Fires on load too when nobody is signed in; only a real sign-out
        // (or an expired session) sends the address back to the start.
        const wasSignedIn = hadSession.current
        hadSession.current = false
        auth.current = 'out'
        setShowAI(false)
        setAiBusy(false)
        clearCache()
        if (!wasSignedIn) return
        if (authNoticeRef.current) setAuthMode('sign-in')
        replacePath(authNoticeRef.current ? '/sign-in' : '/')
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
    pushPath(`/${mode}`)
    setAuthMode(mode)
    setView('auth')
  }

  const navigate = (newView: View, payload?: unknown) => {
    if (newView === 'ai') {
      setShowAI(true)
      setAiContext((payload as AiContext | undefined) ?? null)
      return
    }
    if (newView === 'detail' || newView === 'profile') setReturnTo(view === 'entity' ? 'entity' : 'dashboard')
    if (newView === 'profile') {
      const p = payload as { tab?: ProfileTab; focusId?: string | null } | undefined
      pushPath(profilePath(p?.tab))
      setProfileTab(p?.tab ?? 'account')
      setProfileFocus(p?.focusId ?? null)
    } else if (newView === 'entity') {
      pushPath(entityPath(payload as EntityRef))
      setEntity(payload as EntityRef)
    } else if (newView === 'detail') {
      // Kept for this visit, so Back and Forward return to it at once; a
      // reload or a shared link fetches it by the id in the address.
      const id = (payload as Partial<Regulation> | undefined)?.id
      if (id) {
        writeCache(`ui:detail:${id}`, payload)
        pushPath(detailPath(id))
      }
      setDetailPayload(payload)
    } else if (newView === 'dashboard') pushPath('/')
    setView(newView)
  }

  const handleAuthenticated = async () => {
    clearAuthNotice()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) bindCacheToUser(session.user.id)
    hadSession.current = !!session
    const firmId = await getFirmId().catch(() => null)
    if (firmId) await loadFirm(firmId)
    auth.current = firmId ? 'in' : 'onboarding'
    // On to the page that was asked for before signing in, if there was one.
    const next = firmId ? (pendingPath.current ?? '/') : window.location.pathname
    pendingPath.current = null
    if (firmId) replacePath(next)
    showRoute(next)
  }

  return (
    <div
      className="relative min-h-[100dvh] overflow-x-clip"
      style={{ background: 'var(--canvas)' }}
    >

      {/* Main content above spheres */}
      <div className="relative" style={{ zIndex: 1 }}>
        <Suspense fallback={<ScreenLoadingFallback />}>
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
              onCloseAuth={() => { clearAuthNotice(); pendingPath.current = null; pushPath('/'); setView('landing') }}
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

          {view === 'page' && <InfoPage slug={page} signedIn={auth.current === 'in'} />}

          {view === 'profile' && (
            <ProfileScreen key={profileTab} onBack={goBack} backLabel={returnTo === 'entity' && entity ? 'Back' : 'Back to Dashboard'} initialTab={profileTab} focusId={profileFocus} onTabChange={tab => replacePath(profilePath(tab))} />
          )}
        </Suspense>
      </div>

      {/* RegWay AI drawer — rendered over any view */}
      <Suspense fallback={<ChatLoadingFallback />}>
        {(showAI || aiBusy) && (
          <RegWayAICopilot context={aiContext} hidden={!showAI} onBusyChange={setAiBusy} onClose={() => { setShowAI(false); setAiContext(null) }} />
        )}
      </Suspense>
    </div>
  )
}
