import { useEffect, useState } from 'react'
import { fetchPossibleMatches } from '../lib/data'
import { Question } from './icons'

interface QuestionsCardProps {
  firmId: string | null
  firmName: string | undefined
  onAnswer: () => void
}

// Developments that apply only if one fact RegWay doesn't have is true
// (Profile → Questions): said on the dashboard while any are waiting, so
// they aren't missed. Hidden when none are.
export default function QuestionsCard({ firmId, firmName, onAnswer }: QuestionsCardProps) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!firmId) return
    let live = true
    fetchPossibleMatches(firmId)
      .then(list => live && setCount(list.length))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [firmId])

  if (!count) return null
  const who = firmName ?? 'your firm'
  return (
    <div className="glass-card p-5 sm:p-6 mb-8 flex items-center gap-4 flex-wrap">
      <span className="tile shrink-0" aria-hidden="true" style={{ width: 40, height: 40 }}>
        <Question size={18} />
      </span>
      <div className="flex-1 min-w-[12rem]">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>
          {count === 1 ? `1 development may apply to ${who}` : `${count} developments may apply to ${who}`}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-400)', lineHeight: 1.5 }}>
          {count === 1 ? 'It turns on' : 'Each turns on'} one thing RegWay doesn't know about you. Answer it once and it's used from then on.
        </p>
      </div>
      <button className="btn-ghost shrink-0" onClick={onAnswer}>
        Answer
      </button>
    </div>
  )
}
