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
    <div className="glass-card p-6 sm:p-7">
      <h3 className="text-base font-semibold mb-5" style={{ color: 'var(--text-900)' }}>{heading}</h3>
      <QuestionForm questions={questionsFor(scope, 'onboarding')} answers={answers} onChange={(id, v) => setAnswers(a => ({ ...a, [id]: v }))} />
      <div className="flex items-center gap-4 flex-wrap mt-6">
        <button className="btn-primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : cta}</button>
        {error && <span className="text-[13px]" role="alert" style={{ color: 'var(--warning)' }}>{error}</span>}
      </div>
    </div>
  )
}
