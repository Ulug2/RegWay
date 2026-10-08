// The light/dark switch in the page header. Until it is used the app
// follows the device's setting; using it remembers the choice in this
// browser. Profile → Account can set it back to "Match device".

import { useEffect, useState } from 'react'
import { getThemeChoice, resolveTheme, setThemeChoice } from '../lib/theme'
import { Moon, Sun } from './icons'

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => resolveTheme(getThemeChoice()) === 'dark')

  // The device can change theme while the choice is still "Match device".
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => setDark(resolveTheme(getThemeChoice()) === 'dark')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    setThemeChoice(dark ? 'light' : 'dark')
    setDark(!dark)
  }

  return (
    <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} className="theme-toggle">
      <span className="theme-toggle-knob">
        {dark ? <Moon size={14} weight="fill" aria-hidden="true" /> : <Sun size={14} weight="bold" aria-hidden="true" />}
      </span>
    </button>
  )
}
