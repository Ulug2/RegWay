import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface AuthScreenProps {
  onAuthenticated: () => void
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
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
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-modal w-full max-w-sm" style={{ padding: 32 }}>
        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-9 h-9 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0284C7, #38BDF8)', borderRadius: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L3 6v6l6 4 6-4V6L9 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M9 2v10M3 6l6 4 6-4" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-lg" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
        </div>

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
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>
              {mode === 'sign-up' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm mb-6" style={{ color: '#64748B' }}>
              {mode === 'sign-up' ? 'Set up regulatory intelligence for your firm.' : 'Sign in to your firm workspace.'}
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Email</label>
                <input
                  type="email"
                  required
                  className="glass-input-rect"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="glass-input-rect"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>

              {error && (
                <div className="text-xs p-3 rounded-lg" style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)', color: '#334155' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'sign-up' ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <button
              className="text-xs mt-5 w-full text-center"
              style={{ color: '#0284C7' }}
              onClick={() => { setMode(m => (m === 'sign-up' ? 'sign-in' : 'sign-up')); setError(null) }}
            >
              {mode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
