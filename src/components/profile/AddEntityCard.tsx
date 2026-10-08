import { useState } from 'react'
import QuestionForm from '../questionnaire/QuestionForm'
import { missingRequired, questionsFor, type Answers, type Scope } from '../../lib/questionnaire'

// "Add a fund / company" — only the signup essentials; the rest shows up as a
// to-do on the new card afterwards.
export default function AddEntityCard({ scope, heading, cta, onAdd }: { scope: Scope; heading: string; cta: string; onAdd: (a: Answers) => Promise<void> }) {
  const [answers, setAnswers] = useState<Answers>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    const needed = missingRequired(scope, answers, 'onboarding')
    if (needed.length) {
      setError(`Please fill in: ${needed.map(q => q.label.replace(/\?$/, '')).join(', ')}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAdd(answers)
      setAnswers({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-card" style={{ padding: 28 }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--text-400)' }}>{heading}</div>
      <QuestionForm questions={questionsFor(scope, 'onboarding')} answers={answers} onChange={(id, v) => setAnswers(a => ({ ...a, [id]: v }))} />
      <div className="flex items-center gap-4 mt-6">
        <button className="btn-primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : cta}</button>
        {error && <span className="text-xs" style={{ color: 'var(--text-600)' }}>{error}</span>}
      </div>
    </div>
  )
}
