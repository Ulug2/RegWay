import { useState } from 'react'
import ProgressRing from './ProgressRing'
import { X } from './icons'
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
    <div className="relative glass-card p-5 sm:p-6 mb-8">
      <button onClick={dismiss} aria-label="Dismiss reminder" title="Dismiss until next login" className="btn-icon absolute top-2.5 right-2.5" style={{ width: 30, height: 30, zIndex: 2 }}>
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-4 sm:gap-5 flex-wrap pr-8">
        <ProgressRing percent={percent} size={56} />
        <div className="flex-1 min-w-0 sm:min-w-[12rem]">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>
            Finish setting up RegWay
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-400)', lineHeight: 1.5 }}>
            <span className="num">{left}</span> quick {left === 1 ? 'answer' : 'answers'} left. The more RegWay knows, the sharper your alerts.
          </p>
        </div>
        {/* Full width on a phone, so it takes its own line under the text. */}
        <button className="btn-primary shrink-0 w-full sm:w-auto" onClick={() => onOpen(tabFor(first), first.id)}>Continue</button>
      </div>
      {/* One row on a phone, scrolled sideways; wrapped from sm up. */}
      <div className="flex sm:flex-wrap gap-2 mt-5 overflow-x-auto sm:overflow-visible -mx-5 px-5 sm:mx-0 sm:px-0 [&>*]:shrink-0">
        {incomplete.slice(0, 4).map(i => (
          <button key={`${i.scope}-${i.id}`} onClick={() => onOpen(tabFor(i), i.id)} className="btn-tool" style={{ padding: '5px 12px', fontSize: 12 }}>
            {i.label}
            <span className="num" style={{ color: 'var(--primary)' }}>{i.total - i.answered} left</span>
          </button>
        ))}
        {incomplete.length > 4 && (
          <span className="text-xs self-center whitespace-nowrap" style={{ color: 'var(--text-300)' }}>+{incomplete.length - 4} more</span>
        )}
      </div>
    </div>
  )
}
