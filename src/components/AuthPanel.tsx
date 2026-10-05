import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PasswordInput from './PasswordInput'
import PasswordRequirements from './PasswordRequirements'
import { passwordErrorMessage, passwordProblem } from '../lib/password'

// Sign in, create an account, or ask for a reset link. Shown inside the
// landing page (it slides out beside the hero), not as its own screen.

interface AuthPanelProps {
  onAuthenticated: () => void
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
      onAuthenticated()
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
    <div className="glass-modal w-full relative" style={{ padding: 32 }} role="region" aria-label={mode === 'sign-up' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          style={{ color: '#94a3b8' }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {checkEmail ? (
          <div className="text-center py-4">
            <h2 className="text-lg font-semibold mb-2" style={{ color: '#0F172A' }}>Check your email</h2>
            <p className="text-sm" style={{ color: '#64748B', lineHeight: 1.6 }}>
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
            <h2 className="text-lg font-semibold mb-2" style={{ color: '#0F172A' }}>Check your email</h2>
            <p className="text-sm" style={{ color: '#64748B', lineHeight: 1.6 }}>
              If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
            </p>
            <button className="btn-ghost mt-6" onClick={backToSignIn}>
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>
              {mode === 'sign-up' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
            </h2>
            <p className="text-sm mb-6" style={{ color: '#64748B' }}>
              {mode === 'sign-up'
                ? 'Set up regulatory intelligence for your firm.'
                : mode === 'forgot'
                  ? "Enter your email and we'll send you a reset link."
                  : 'Sign in to your firm workspace.'}
            </p>

            {notice && mode === 'sign-in' && (
              <div role="status" className="text-xs p-3 rounded-lg mb-4" style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)', color: '#334155', lineHeight: 1.6 }}>
                {notice}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Email</label>
                <input
                  type="email"
                  required
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
                    <label className="block text-xs font-medium" style={{ color: '#334155' }}>Password</label>
                    {mode === 'sign-in' && (
                      <button
                        type="button"
                        className="text-xs font-medium"
                        style={{ color: '#0284C7' }}
                        onClick={() => { setMode('forgot'); setError(null) }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <PasswordInput
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
                <div className="text-xs p-3 rounded-lg" style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)', color: '#334155' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'sign-up' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
              </button>
            </form>

            {mode === 'forgot' ? (
              <button className="text-xs mt-5 w-full text-center" style={{ color: '#0284C7' }} onClick={backToSignIn}>
                Back to sign in
              </button>
            ) : (
              <button
                className="text-xs mt-5 w-full text-center"
                style={{ color: '#0284C7' }}
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
