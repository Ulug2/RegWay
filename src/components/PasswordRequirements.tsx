import { PASSWORD_RULES } from '../lib/password'
import { Check } from './icons'

// The rules for a new password, each ticked off as it's met.
export default function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password)
        return (
          <li key={rule.key} className="flex items-center gap-2 text-xs transition-colors" style={{ color: met ? 'var(--primary)' : 'var(--text-400)' }} data-met={met}>
            {met ? <Check size={13} weight="bold" aria-hidden="true" /> : <span className="w-[13px] flex justify-center" aria-hidden="true"><span className="w-1 h-1 rounded-full" style={{ background: 'currentColor' }} /></span>}
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
