import { useState } from 'react'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  minLength?: number
  autoComplete?: 'current-password' | 'new-password'
  ariaLabel?: string
}

export default function PasswordInput({ value, onChange, placeholder, required, minLength, autoComplete, ariaLabel }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        className="glass-input-rect"
        style={{ paddingRight: 44 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-sky-50 transition-colors"
        style={{ color: 'var(--text-300)' }}
      >
        {visible ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2l12 12M6.6 6.6a2 2 0 002.8 2.8M4.2 4.4C2.9 5.3 1.9 6.6 1.5 8c.9 2.6 3.4 4.5 6.5 4.5 1 0 1.9-.2 2.7-.6M13 10.7c.7-.7 1.2-1.6 1.5-2.7-.9-2.6-3.4-4.5-6.5-4.5-.3 0-.6 0-.9.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1.5 8C2.4 5.4 4.9 3.5 8 3.5s5.6 1.9 6.5 4.5c-.9 2.6-3.4 4.5-6.5 4.5S2.4 10.6 1.5 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        )}
      </button>
    </div>
  )
}
