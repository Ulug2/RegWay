import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getFirmId, fetchFirm, updateFirm } from '../lib/data'
import LogoMark from './LogoMark'
import PasswordInput from './PasswordInput'
import FirmSettings from './settings/FirmSettings'
import FundsSettings from './settings/FundsSettings'
import PortfolioSettings from './settings/PortfolioSettings'

export type ProfileTab = 'account' | 'firm' | 'funds' | 'portfolio'

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'firm', label: 'Firm' },
  { key: 'funds', label: 'Funds' },
  { key: 'portfolio', label: 'Portfolio Companies' },
]

interface ProfileScreenProps {
  onBack: () => void
  initialTab?: ProfileTab
}

export default function ProfileScreen({ onBack, initialTab = 'account' }: ProfileScreenProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [firmId, setFirmId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailCheckInbox, setEmailCheckInbox] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  useEffect(() => {
    getFirmId().then(async id => {
      if (!id) return
      setFirmId(id)
      const firm = await fetchFirm(id)
      setName(firm.lead_gp_name ?? '')
    })

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
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
      const { error } = await supabase.auth.updateUser({ email })
      if (error) throw error
      setEmailCheckInbox(true)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setEmailLoading(false)
    }
  }

  const savePassword = async () => {
    setPasswordError(null)
    setPasswordSaved(false)
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    setPasswordLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPasswordSaved(true)
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
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
            style={{ color: '#334155', border: '1px solid rgba(186,230,253,0.40)', background: 'rgba(255,255,255,0.60)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="font-semibold text-sm" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[900px] mx-auto w-full px-8" style={{ paddingTop: 56, paddingBottom: 64 }}>
        <div style={{ marginBottom: 40 }}>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>Profile</h1>
          <p className="text-sm" style={{ color: '#64748B' }}>Your account and your firm's workspace settings.</p>
        </div>

        <div
          className="inline-flex flex-wrap gap-1 p-1.5"
          style={{ marginBottom: 32, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(186,230,253,0.40)', borderRadius: 9999 }}
        >
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-5 py-2 text-sm font-medium transition-all"
              style={{
                borderRadius: 9999,
                background: tab === t.key ? 'linear-gradient(135deg,#0284C7,#38BDF8)' : 'transparent',
                color: tab === t.key ? 'white' : '#64748B',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'firm' && firmId && <FirmSettings firmId={firmId} />}
        {tab === 'funds' && firmId && <FundsSettings firmId={firmId} />}
        {tab === 'portfolio' && firmId && <PortfolioSettings firmId={firmId} />}

        {tab === 'account' && (
        <div className="space-y-6">
          {/* Name */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Your name</h2>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>Shown across the dashboard and in Harvey's context.</p>
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
            {nameError && <div className="text-xs mt-3" style={{ color: '#334155' }}>{nameError}</div>}
            {nameSaved && <div className="text-xs mt-3" style={{ color: '#0284C7' }}>Saved.</div>}
          </div>

          {/* Email */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Email</h2>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>Used to sign in to your account.</p>
            {emailCheckInbox ? (
              <div className="text-sm p-3 rounded-lg" style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)', color: '#334155' }}>
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
            {emailError && <div className="text-xs mt-3" style={{ color: '#334155' }}>{emailError}</div>}
          </div>

          {/* Password */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Password</h2>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>Applies immediately — no confirmation email.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <PasswordInput
                value={password}
                onChange={v => { setPassword(v); setPasswordSaved(false) }}
                placeholder="New password"
              />
              <PasswordInput
                value={confirmPassword}
                onChange={v => { setConfirmPassword(v); setPasswordSaved(false) }}
                placeholder="Confirm new password"
              />
            </div>
            <button className="btn-primary" onClick={savePassword} disabled={passwordLoading}>
              {passwordLoading ? 'Updating…' : 'Update Password'}
            </button>
            {passwordError && <div className="text-xs mt-3" style={{ color: '#334155' }}>{passwordError}</div>}
            {passwordSaved && <div className="text-xs mt-3" style={{ color: '#0284C7' }}>Password updated.</div>}
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
