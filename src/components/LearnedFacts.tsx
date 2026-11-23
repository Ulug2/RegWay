import { learnedText, type LearnedFact } from '../lib/research'
import { NotePencil } from './icons'

// Shown under a chat answer or a re-check result.
export default function LearnedFacts({ facts, onReview }: { facts: LearnedFact[]; onReview: () => void }) {
  if (!facts.length) return null
  return (
    <div className="flex items-start gap-2 text-[13px] mt-2.5" role="status" style={{ color: 'var(--text-500)', lineHeight: 1.55 }}>
      <NotePencil size={14} aria-hidden="true" className="shrink-0 mt-[3px]" style={{ color: 'var(--primary)' }} />
      <span>
        Suggested for your profile: {facts.map(learnedText).join('. ')}.{' '}
        <button type="button" className="link" onClick={onReview}>
          Review in Profile
        </button>
      </span>
    </div>
  )
}
