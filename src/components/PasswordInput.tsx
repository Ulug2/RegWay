import { useState } from 'react'
import { Eye, EyeSlash } from './icons'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  minLength?: number
  autoComplete?: 'current-password' | 'new-password'
  ariaLabel?: string
  id?: string
  name?: string
}

export default function PasswordInput({ value, onChange, placeholder, required, minLength, autoComplete, ariaLabel, id, name = 'password' }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={ariaLabel ?? (id ? undefined : placeholder)}
        id={id}
        name={name}
        spellCheck={false}
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
        className="btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
        style={{ width: 32, height: 32 }}
      >
        {visible ? <EyeSlash size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </div>
  )
}
