import { PASSWORD_RULES } from '../lib/password'

// The rules for a new password, each ticked off as it's met.
export default function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password)
        return (
          <li key={rule.key} className="flex items-center gap-2 text-xs" style={{ color: met ? 'var(--primary)' : 'var(--text-300)' }} data-met={met}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              {met ? (
                <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <circle cx="6" cy="6" r="2" fill="currentColor" />
              )}
            </svg>
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
