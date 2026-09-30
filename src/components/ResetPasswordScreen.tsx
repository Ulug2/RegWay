import { useState } from 'react'
import { supabase } from '../lib/supabase'
import LogoMark from './LogoMark'
import PasswordInput from './PasswordInput'

interface ResetPasswordScreenProps {
  onDone: () => void
}

// Reached only via the recovery link from a password-reset email — Supabase
// parses the URL's recovery token and fires a PASSWORD_RECOVERY auth event
// (handled in App.tsx) before this ever renders, so a session already exists.
export default function ResetPasswordScreen({ onDone }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-modal w-full max-w-sm" style={{ padding: 32 }}>
        <div className="flex items-center gap-2 mb-8">
          <LogoMark size={36} />
          <span className="font-semibold text-lg" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
        </div>

        <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>Set a new password</h2>
        <p className="text-sm mb-6" style={{ color: '#64748B' }}>Choose a new password for your account.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>New password</label>
            <PasswordInput required minLength={6} value={password} onChange={setPassword} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Confirm password</label>
            <PasswordInput required minLength={6} value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" />
          </div>

          {error && (
            <div className="text-xs p-3 rounded-lg" style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)', color: '#334155' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Please wait…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
