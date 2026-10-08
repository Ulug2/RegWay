import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Wordmark } from './PageHeader'
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
    <main className="min-h-[100dvh] flex items-center justify-center p-5 sm:p-6">
      <div className="glass-modal w-full max-w-sm p-7 sm:p-8">
        <div className="mb-8">
          <Wordmark size={32} />
        </div>

        <h1 className="text-[22px] font-semibold mb-1" style={{ color: 'var(--text-900)', letterSpacing: '-0.025em' }}>Set a new password</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-400)' }}>Choose a new password for your account.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>New password</label>
            <PasswordInput id="new-password" name="new-password" required value={password} onChange={setPassword} placeholder="Create a password" autoComplete="new-password" />
            <PasswordRequirements password={password} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>Confirm password</label>
            <PasswordInput id="confirm-password" name="confirm-password" required value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" autoComplete="new-password" />
          </div>

          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Please wait…' : 'Update Password'}
          </button>
        </form>
      </div>
    </main>
  )
}
