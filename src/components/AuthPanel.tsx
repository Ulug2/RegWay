import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase'
import PasswordInput from './PasswordInput'
import PasswordRequirements from './PasswordRequirements'
import { X } from './icons'
import { passwordErrorMessage, passwordProblem } from '../lib/password'

// Sign in, create an account, or ask for a reset link. Shown inside the
// landing page (it slides out beside the hero), not as its own screen.

interface AuthPanelProps {
  onAuthenticated: () => void | Promise<void>
  initialMode?: 'sign-in' | 'sign-up'
  onClose: () => void
  // Why the user is seeing this form, when the app sent them here.
  notice?: string | null
}

export default function AuthPanel({ onAuthenticated, initialMode = 'sign-up', onClose, notice }: AuthPanelProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const id = useId()

  // Escape closes the form, as the × does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    // Only a new password is held to the rules: an existing account may
    // have one set before they applied.
    const problem = mode === 'sign-up' ? passwordProblem(password) : null
    if (problem) {
      setError(problem)
      return
    }
    setLoading(true)
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (resetError) throw resetError
        setResetSent(true)
        return
      }
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          // Email confirmation is required by the project's auth settings.
          setCheckEmail(true)
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
      await onAuthenticated()
    } catch (err) {
      setError(passwordErrorMessage(err, 'Something went wrong'))
    } finally {
      setLoading(false)
    }
  }

  const backToSignIn = () => {
    setMode('sign-in')
    setResetSent(false)
    setError(null)
  }

  return (
    <div className="glass-modal w-full relative p-7 sm:p-8" role="region" aria-label={mode === 'sign-up' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="btn-icon absolute top-3.5 right-3.5"
          style={{ zIndex: 2 }}
        >
          <X size={15} weight="bold" aria-hidden="true" />
        </button>
        {checkEmail ? (
          <div className="text-center py-4">
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-900)' }}>Check your email</h2>
            <p className="text-sm" style={{ color: 'var(--text-400)', lineHeight: 1.6 }}>
              We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and sign in.
            </p>
            <button
              className="btn-ghost mt-6"
              onClick={() => { setCheckEmail(false); setMode('sign-in') }}
            >
              Back to sign in
            </button>
          </div>
        ) : mode === 'forgot' && resetSent ? (
          <div className="text-center py-4">
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-900)' }}>Check your email</h2>
            <p className="text-sm" style={{ color: 'var(--text-400)', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
            </p>
            <button className="btn-ghost mt-6" onClick={backToSignIn}>
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[22px] font-semibold mb-1 pr-8" style={{ color: 'var(--text-900)', letterSpacing: '-0.025em' }}>
              {mode === 'sign-up' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-400)' }}>
              {mode === 'sign-up'
                ? 'Set up regulatory intelligence for your firm.'
                : mode === 'forgot'
                  ? "Enter your email and we'll send you a reset link."
                  : 'Sign in to your firm workspace.'}
            </p>

            {notice && mode === 'sign-in' && (
              <div role="status" className="notice mb-4">
                {notice}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor={`${id}-email`} className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>Email</label>
                <input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  // The form opens because the user asked for it: start in its first field.
                  autoFocus
                  className="glass-input-rect"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                />
              </div>
              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor={`${id}-password`} className="block text-[13px] font-medium" style={{ color: 'var(--text-600)' }}>Password</label>
                    {mode === 'sign-in' && (
                      <button
                        type="button"
                        className="link text-[13px]"
                        onClick={() => { setMode('forgot'); setError(null) }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <PasswordInput
                    id={`${id}-password`}
                    required
                    value={password}
                    onChange={setPassword}
                    placeholder={mode === 'sign-up' ? 'Create a password' : 'Your password'}
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  />
                  {mode === 'sign-up' && <PasswordRequirements password={password} />}
                </div>
              )}

              {error && (
                <div className="notice" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'sign-up' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
              </button>
            </form>

            {mode === 'forgot' ? (
              <button className="text-[13px] font-medium mt-5 w-full text-center hover:underline underline-offset-4" style={{ color: 'var(--primary)' }} onClick={backToSignIn}>
                Back to sign in
              </button>
            ) : (
              <button
                className="text-[13px] font-medium mt-5 w-full text-center hover:underline underline-offset-4"
                style={{ color: 'var(--primary)' }}
                onClick={() => { setMode(m => (m === 'sign-up' ? 'sign-in' : 'sign-up')); setError(null) }}
              >
                {mode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
              </button>
            )}
          </>
        )}
    </div>
  )
}
