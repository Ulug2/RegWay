import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFirm, updateFirm, getCachedFirmId, getCachedFirm } from '../lib/data'
import { readCache, writeCache } from '../lib/cache'
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../lib/theme'
import Chip from './Chip'
import PageHeader from './PageHeader'
import { CheckCircle } from './icons'
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
  // Told when the user changes tab, so the address can follow.
  onTabChange?: (tab: ProfileTab) => void
  // A fund/company to open straight away (from a completion reminder).
  focusId?: string | null
}

export default function ProfileScreen({ onBack, backLabel = 'Back to Dashboard', initialTab = 'account', focusId, onTabChange }: ProfileScreenProps) {
  const [tab, setTabState] = useState<ProfileTab>(initialTab)
  const setTab = (next: ProfileTab) => {
    setTabState(next)
    onTabChange?.(next)
  }
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
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <PageHeader back={{ label: backLabel, onClick: onBack }} width="max-w-[900px]" />

      <main id="main" className="flex-1 w-full max-w-[900px] mx-auto px-5 sm:px-8 pt-10 sm:pt-12 pb-16">
        <div className="mb-8">
          <h1 className="text-[28px] sm:text-[32px] font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.035em', lineHeight: 1.15 }}>Profile</h1>
          <p className="text-[15px] mt-2" style={{ color: 'var(--text-400)' }}>Your account and your firm's workspace settings.</p>
        </div>

        {/* Scrolls sideways on a phone rather than wrapping into a block. */}
        <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0 mb-8">
          <div className="seg seg-lg flex-nowrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key} className={`seg-item ${tab === t.key ? 'is-on' : ''}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'firm' && firmId && <FirmProfile firmId={firmId} />}
        {tab === 'funds' && firmId && <FundsProfile firmId={firmId} focusId={focusId} />}
        {tab === 'portfolio' && firmId && <CompaniesProfile firmId={firmId} focusId={focusId} />}

        {tab === 'dismissed' && firmId && <DismissedRegulations firmId={firmId} />}

        {tab === 'account' && (
        <div className="space-y-6">
          {/* Appearance */}
          <div className="glass-card p-6 sm:p-7">
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-900)' }}>Appearance</h2>
            <div className="flex gap-2" role="radiogroup" aria-label="Theme">
              {THEMES.map(t => (
                <Chip key={t.key} selected={theme === t.key} onClick={() => { setThemeChoice(t.key); setTheme(t.key) }}>{t.label}</Chip>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="glass-card p-6 sm:p-7">
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-900)' }}><label htmlFor="account-name">Your name</label></h2>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[14rem]">
                <input
                  id="account-name"
                  name="name"
                  autoComplete="name"
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
            {nameError && <div className="text-[13px] mt-3" role="alert" style={{ color: 'var(--warning)' }}>{nameError}</div>}
            {nameSaved && <div className="text-[13px] mt-3 flex items-center gap-1.5 font-medium" aria-live="polite" style={{ color: 'var(--primary)' }}><CheckCircle size={15} weight="fill" aria-hidden="true" />Saved.</div>}
          </div>

          {/* Email */}
          <div className="glass-card p-6 sm:p-7">
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-900)' }}><label htmlFor="account-email">Email</label></h2>
            {emailCheckInbox ? (
              <div className="notice" aria-live="polite">
                Check <strong>{email}</strong> for a confirmation link. The change won't take effect until you click it.
              </div>
            ) : (
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[14rem]">
                  <input
                    id="account-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
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
            {emailError && <div className="text-[13px] mt-3" role="alert" style={{ color: 'var(--warning)' }}>{emailError}</div>}
          </div>

          {/* Password */}
          <div className="glass-card p-6 sm:p-7">
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-900)' }}>Password</h2>
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
              <button type="button" className="link text-[13px]" onClick={forgotPassword} disabled={passwordLoading || !accountEmail}>
                Forgot password?
              </button>
            </div>
            {resetLinkSent && (
              <div role="status" className="notice mt-4">
                We sent a link to <strong>{accountEmail}</strong>. Open it to set your new password; you'll then be asked to sign in again.
              </div>
            )}
            {passwordError && <div className="text-[13px] mt-3" role="alert" style={{ color: 'var(--warning)' }}>{passwordError}</div>}
          </div>

          {/* Sign out */}
          <div className="flex pt-2">
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
