import { useState } from 'react'
import ProgressRing from './ProgressRing'
import { readCache, writeCache } from '../lib/cache'
import type { CompletionItem } from '../lib/questionnaire'
import type { ProfileCompletion } from '../lib/useProfileCompletion'
import type { ProfileTab } from './ProfileScreen'

// Persisted in the cache, which is wiped on sign-out — so a dismissed
// reminder stays hidden through reloads but returns at the next login.
const DISMISSED_KEY = 'reminder:dismissed'

export const tabFor = (i: CompletionItem): ProfileTab => (i.scope === 'firm' ? 'firm' : i.scope === 'fund' ? 'funds' : 'portfolio')

interface ProfileReminderProps {
  completion: ProfileCompletion
  onOpen: (tab: ProfileTab, focusId?: string | null) => void
}

// A gentle nudge on the dashboard while required profile answers are missing.
// The X hides it for this login; it returns every time the user signs in until
// the profile is complete.
export default function ProfileReminder({ completion, onOpen }: ProfileReminderProps) {
  const [dismissed, setDismissed] = useState(() => readCache<boolean>(DISMISSED_KEY) ?? false)

  if (!completion.ready || completion.incomplete.length === 0 || dismissed) return null

  const { incomplete, percent } = completion
  const left = incomplete.reduce((n, i) => n + (i.total - i.answered), 0)
  const first = incomplete[0]

  const dismiss = () => {
    writeCache(DISMISSED_KEY, true)
    setDismissed(true)
  }

  return (
    <div className="relative max-w-2xl mx-auto glass-card" style={{ padding: 24, marginBottom: 40 }}>
      <button
        onClick={dismiss}
        aria-label="Dismiss reminder"
        title="Dismiss until next login"
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full hover:bg-sky-50 transition-colors"
        style={{ color: 'var(--text-300)', zIndex: 1 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex items-center gap-5">
        <ProgressRing percent={percent} size={60} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>
            Finish setting up RegWay
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-400)' }}>
            {left} quick {left === 1 ? 'answer' : 'answers'} left — the more RegWay knows, the sharper your alerts.
          </p>
        </div>
        <button className="btn-primary shrink-0" style={{ marginRight: 16 }} onClick={() => onOpen(tabFor(first), first.id)}>Continue</button>
      </div>
      <div className="flex flex-wrap gap-2 mt-5">
        {incomplete.slice(0, 4).map(i => (
          <button
            key={`${i.scope}-${i.id}`}
            onClick={() => onOpen(tabFor(i), i.id)}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium transition-all hover:bg-sky-50"
            style={{ borderRadius: 9999, background: 'rgb(var(--surface-rgb) / 0.75)', border: '1px solid rgb(var(--line-strong-rgb) / 0.55)', color: 'var(--text-600)' }}
          >
            {i.label}
            <span style={{ color: 'var(--primary)' }}>{i.total - i.answered} left</span>
          </button>
        ))}
        {incomplete.length > 4 && (
          <span className="text-xs self-center" style={{ color: 'var(--text-300)' }}>+{incomplete.length - 4} more</span>
        )}
      </div>
    </div>
  )
}
