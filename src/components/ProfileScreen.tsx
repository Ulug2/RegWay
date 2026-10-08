import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFirm, updateFirm, getCachedFirmId, getCachedFirm } from '../lib/data'
import { readCache, writeCache } from '../lib/cache'
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../lib/theme'
import Chip from './Chip'
import LogoMark from './LogoMark'
import PasswordInput from './PasswordInput'
import FirmProfile from './profile/FirmProfile'
import FundsProfile from './profile/FundsProfile'
import CompaniesProfile from './profile/CompaniesProfile'
import DismissedRegulations from './profile/DismissedRegulations'

export type ProfileTab = 'account' | 'firm' | 'funds' | 'portfolio' | 'dismissed'

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'firm', label: 'Firm' },
  { key: 'funds', label: 'Funds' },
  { key: 'portfolio', label: 'Portfolio Companies' },
  { key: 'dismissed', label: 'Dismissed' },
]

const THEMES: { key: ThemeChoice; label: string }[] = [
  { key: 'system', label: 'Match device' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

interface ProfileScreenProps {
  onBack: () => void
  // Where "back" goes: the dashboard, or the fund / company page it was opened from.
  backLabel?: string
  initialTab?: ProfileTab
  // A fund/company to open straight away (from a completion reminder).
  focusId?: string | null
}

export default function ProfileScreen({ onBack, backLabel = 'Back to Dashboard', initialTab = 'account', focusId }: ProfileScreenProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice)
  const [firmId, setFirmId] = useState<string | null>(getCachedFirmId)

  const [name, setName] = useState(() => getCachedFirm()?.lead_gp_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [email, setEmail] = useState(() => readCache<string>('account:email') ?? '')
  // The address the account signs in with now; `email` is the editable field.
  const [accountEmail, setAccountEmail] = useState(() => readCache<string>('account:email') ?? '')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailCheckInbox, setEmailCheckInbox] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [resetLinkSent, setResetLinkSent] = useState(false)

  useEffect(() => {
    getFirmId().then(async id => {
      if (!id) return
      setFirmId(id)
      const firm = await fetchFirm(id)
      setName(firm.lead_gp_name ?? '')
    })

    supabase.auth.getUser().then(({ data }) => {
      const current = data.user?.email ?? ''
      setAccountEmail(current)
      setEmail(current)
      writeCache('account:email', current)
    })
  }, [])

  const saveName = async () => {
    if (!firmId) return
    setNameLoading(true)
    setNameError(null)
    setNameSaved(false)
    try {
      await updateFirm(firmId, { lead_gp_name: name })
      setNameSaved(true)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to save name')
    } finally {
      setNameLoading(false)
    }
  }

  const saveEmail = async () => {
    setEmailLoading(true)
    setEmailError(null)
    setEmailCheckInbox(false)
    try {
      const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: window.location.origin })
      if (error) throw error
      setEmailCheckInbox(true)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setEmailLoading(false)
    }
  }

  // A password is never changed from this screen. Both routes email
  // Supabase's reset link: it opens the new-password page, and saving there
  // signs the user out to sign in again. That makes control of the inbox
  // part of every change.
  const sendResetLink = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(accountEmail, { redirectTo: window.location.origin })
    if (error) throw error
    setResetLinkSent(true)
    setCurrentPassword('')
  }

  // "Update Password": the current password first, so an unattended open
  // session can't start a change.
  const updatePassword = async () => {
    setPasswordError(null)
    setResetLinkSent(false)
    if (!currentPassword) {
      setPasswordError('Enter your current password')
      return
    }
    setPasswordLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: accountEmail, password: currentPassword })
      if (error) throw new Error(error.code === 'invalid_credentials' ? 'Your current password is incorrect' : error.message)
      await sendResetLink()
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to send the link')
    } finally {
      setPasswordLoading(false)
    }
  }

  // "Forgot password?": the same as on the sign-in screen.
  const forgotPassword = async () => {
    setPasswordError(null)
    setResetLinkSent(false)
    setPasswordLoading(true)
    try {
      await sendResetLink()
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to send the reset link')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Top Nav */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-[900px] mx-auto px-8 h-20 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all hover:bg-sky-50"
            style={{ color: 'var(--text-600)', border: '1px solid rgb(var(--line-rgb) / 0.40)', background: 'rgb(var(--surface-rgb) / 0.60)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {backLabel}
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="font-semibold text-sm" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[900px] mx-auto w-full px-8" style={{ paddingTop: 56, paddingBottom: 64 }}>
        <div style={{ marginBottom: 40 }}>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>Profile</h1>
          <p className="text-sm" style={{ color: 'var(--text-400)' }}>Your account and your firm's workspace settings.</p>
        </div>

        <div
          className="inline-flex flex-wrap gap-1 p-1.5"
          style={{ marginBottom: 32, background: 'rgb(var(--surface-rgb) / 0.60)', border: '1px solid rgb(var(--line-rgb) / 0.40)', borderRadius: 9999 }}
        >
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-5 py-2 text-sm font-medium transition-all"
              style={{
                borderRadius: 9999,
                background: tab === t.key ? 'linear-gradient(135deg,var(--brand),var(--brand-light))' : 'transparent',
                color: tab === t.key ? 'white' : 'var(--text-400)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'firm' && firmId && <FirmProfile firmId={firmId} />}
        {tab === 'funds' && firmId && <FundsProfile firmId={firmId} focusId={focusId} />}
        {tab === 'portfolio' && firmId && <CompaniesProfile firmId={firmId} focusId={focusId} />}

        {tab === 'dismissed' && firmId && <DismissedRegulations firmId={firmId} />}

        {tab === 'account' && (
        <div className="space-y-6">
          {/* Appearance */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-900)' }}>Appearance</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-300)' }}>Light, dark, or whatever your device is set to. Remembered in this browser.</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Theme">
              {THEMES.map(t => (
                <Chip key={t.key} selected={theme === t.key} onClick={() => { setThemeChoice(t.key); setTheme(t.key) }}>{t.label}</Chip>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-900)' }}>Your name</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-300)' }}>Shown across the dashboard and in RegWay AI's context.</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <input
                  className="glass-input-rect"
                  value={name}
                  onChange={e => { setName(e.target.value); setNameSaved(false) }}
                  placeholder="e.g. James Whitmore"
                />
              </div>
              <button className="btn-primary" onClick={saveName} disabled={nameLoading}>
                {nameLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameError && <div className="text-xs mt-3" style={{ color: 'var(--text-600)' }}>{nameError}</div>}
            {nameSaved && <div className="text-xs mt-3" style={{ color: 'var(--primary)' }}>Saved.</div>}
          </div>

          {/* Email */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-900)' }}>Email</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-300)' }}>Used to sign in to your account.</p>
            {emailCheckInbox ? (
              <div className="text-sm p-3 rounded-lg" style={{ background: 'rgb(var(--primary-rgb) / 0.06)', border: '1px solid rgb(var(--primary-rgb) / 0.15)', color: 'var(--text-600)' }}>
                Check <strong>{email}</strong> for a confirmation link. The change won't take effect until you click it.
              </div>
            ) : (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <input
                    type="email"
                    className="glass-input-rect"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@firm.com"
                  />
                </div>
                <button className="btn-primary" onClick={saveEmail} disabled={emailLoading}>
                  {emailLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
            {emailError && <div className="text-xs mt-3" style={{ color: 'var(--text-600)' }}>{emailError}</div>}
          </div>

          {/* Password */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-900)' }}>Password</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-300)' }}>
              Enter your current password and we'll email you a link to set a new one. After you set it, you'll sign in again.
            </p>
            <div className="mb-4 md:max-w-sm">
              <PasswordInput
                value={currentPassword}
                onChange={v => { setCurrentPassword(v); setPasswordError(null) }}
                placeholder="Current password"
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <button className="btn-primary" onClick={updatePassword} disabled={passwordLoading}>
                {passwordLoading ? 'Please wait…' : 'Update Password'}
              </button>
              <button type="button" className="text-xs font-medium" style={{ color: 'var(--primary)' }} onClick={forgotPassword} disabled={passwordLoading || !accountEmail}>
                Forgot password?
              </button>
            </div>
            {resetLinkSent && (
              <div role="status" className="text-sm mt-4 p-3 rounded-lg" style={{ background: 'rgb(var(--primary-rgb) / 0.06)', border: '1px solid rgb(var(--primary-rgb) / 0.15)', color: 'var(--text-600)', lineHeight: 1.6 }}>
                We sent a link to <strong>{accountEmail}</strong>. Open it to set your new password; you'll then be asked to sign in again.
              </div>
            )}
            {passwordError && <div className="text-xs mt-3" style={{ color: 'var(--text-600)' }}>{passwordError}</div>}
          </div>

          {/* Sign out */}
          <div className="flex justify-center pt-2">
            <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
              Sign Out
            </button>
          </div>
        </div>
        )}
      </main>
    </div>
  )
}
