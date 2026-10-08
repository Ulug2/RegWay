import { useState } from 'react'
import { supabase } from '../lib/supabase'
import LogoMark from './LogoMark'
import PasswordInput from './PasswordInput'
import PasswordRequirements from './PasswordRequirements'
import { passwordErrorMessage, passwordProblem } from '../lib/password'

interface ResetPasswordScreenProps {
  // Called once the new password is saved. The app then signs the user out
  // (ending any other session still using the old password) and asks them
  // to sign in with the new one.
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
    const problem = passwordProblem(password, confirmPassword)
    if (problem) {
      setError(problem)
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      onDone()
    } catch (err) {
      setError(passwordErrorMessage(err, 'Failed to update password'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-modal w-full max-w-sm" style={{ padding: 32 }}>
        <div className="flex items-center gap-2 mb-8">
          <LogoMark size={36} />
          <span className="font-semibold text-lg" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>RegWay</span>
        </div>

        <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>Set a new password</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-400)' }}>Choose a new password for your account.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>New password</label>
            <PasswordInput required value={password} onChange={setPassword} placeholder="Create a password" autoComplete="new-password" />
            <PasswordRequirements password={password} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>Confirm password</label>
            <PasswordInput required value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" autoComplete="new-password" />
          </div>

          {error && (
            <div className="text-xs p-3 rounded-lg" style={{ background: 'rgb(var(--primary-rgb) / 0.06)', border: '1px solid rgb(var(--primary-rgb) / 0.15)', color: 'var(--text-600)' }}>
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
