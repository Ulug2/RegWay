// What a new password must satisfy, checked in the browser before it is
// sent. Supabase Auth enforces its own rules on the server (minimum length,
// required characters, and leaked-password protection when enabled); keep
// these in line with the project's Auth settings so the two never disagree.

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordRule {
  key: string
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: p => p.length >= PASSWORD_MIN_LENGTH },
  { key: 'lower', label: 'A lowercase letter', test: p => /[a-z]/.test(p) },
  { key: 'upper', label: 'An uppercase letter', test: p => /[A-Z]/.test(p) },
  { key: 'digit', label: 'A number', test: p => /\d/.test(p) },
  { key: 'symbol', label: 'A symbol (e.g. ! ? # $)', test: p => /[^A-Za-z0-9\s]/.test(p) },
]

export const unmetPasswordRules = (password: string) => PASSWORD_RULES.filter(rule => !rule.test(password))

// The first problem with a new password, or null when it can be submitted.
export function passwordProblem(password: string, confirmation?: string): string | null {
  const unmet = unmetPasswordRules(password)
  if (unmet.length) return `Password needs: ${unmet.map(r => r.label.toLowerCase()).join(', ')}.`
  if (confirmation !== undefined && password !== confirmation) return 'Passwords do not match'
  return null
}

// Supabase's refusal of a password, in plain words. `reasons` says why:
// too short, missing character types, or found in a known breach (the
// leaked-password check against HaveIBeenPwned).
export function passwordErrorMessage(err: unknown, fallback: string): string {
  const e = err as { code?: string; reasons?: string[]; message?: string } | null
  if (e?.code === 'weak_password') {
    if (e.reasons?.includes('pwned')) return 'This password has appeared in a known data breach. Choose a different one.'
    return 'This password is too weak. Use at least 8 characters with uppercase and lowercase letters, a number and a symbol.'
  }
  if (e?.code === 'same_password') return 'The new password must be different from your current one.'
  return e?.message || fallback
}
