// Light and dark themes (roadmap 16b.3). The colours live in src/index.css
// as variables; this decides which set applies by setting `data-theme` on
// <html>. By default it follows the system setting; a choice made in
// Profile → Account is remembered in this browser.
//
// index.html applies the stored choice before the app loads, so a dark
// page never flashes light first. Keep the two in step.

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'regway:theme'
const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

export function getThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export const resolveTheme = (choice: ThemeChoice, prefersDark = systemDark()): 'light' | 'dark' => (choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice)

export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  document.documentElement.dataset.theme = resolveTheme(choice)
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  applyTheme(choice)
}

// Follows the system setting while the choice is "system". Returns the
// function that stops listening.
export function watchSystemTheme(): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media) return () => {}
  const onChange = () => {
    if (getThemeChoice() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
