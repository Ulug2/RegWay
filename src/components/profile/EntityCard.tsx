import { useEffect, useState } from 'react'
import QuestionForm from '../questionnaire/QuestionForm'
import RemoveButton from './RemoveButton'
import ProgressRing from '../ProgressRing'
import { fromRow, isEmpty, missingRequired, questionsFor, requiredCount, type Answers, type Scope } from '../../lib/questionnaire'

interface EntityCardProps {
  scope: Scope
  title: string
  subtitle?: string
  row: Record<string, unknown> | null
  defaultOpen?: boolean
  onSave: (answers: Answers) => Promise<void>
  onRemove?: () => Promise<void>
}

// One firm / fund / company: a collapsible glass card holding its full
// questionnaire. Signup answers and "complete later" answers live in the same
// form, with the still-needed required ones softly flagged.
export default function EntityCard({ scope, title, subtitle, row, defaultOpen, onSave, onRemove }: EntityCardProps) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [answers, setAnswers] = useState<Answers>(() => fromRow(scope, row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(false)

  // Fresh server data replaces the form unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setAnswers(fromRow(scope, row))
  }, [row])

  const total = requiredCount(scope, answers)
  const left = missingRequired(scope, answers).length
  const percent = total === 0 ? 100 : ((total - left) / total) * 100

  const change = (id: string, value: unknown) => {
    setAnswers(a => ({ ...a, [id]: value }))
    setDirty(true)
    setSavedAt(false)
  }

  const save = async () => {
    // Partial progress is fine — unanswered questions stay flagged "Needed".
    // Only a name is mandatory to save.
    if (isEmpty(answers.name)) {
      setError('A name is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(answers)
      setDirty(false)
      setSavedAt(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-card" style={{ padding: 0 }}>
      <button className="w-full flex items-center gap-4 text-left" style={{ padding: 24 }} onClick={() => setOpen(o => !o)}>
        <ProgressRing percent={percent} size={44} label={left === 0 ? '✓' : undefined} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold truncate" style={{ color: '#0F172A' }}>{title || 'Untitled'}</div>
          <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            {left === 0 ? 'Profile complete' : `${left} required ${left === 1 ? 'question' : 'questions'} left`}
            {subtitle ? ` · ${subtitle}` : ''}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: '#94a3b8' }}>
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '4px 28px 28px' }}>
          <QuestionForm questions={questionsFor(scope)} answers={answers} onChange={change} flagMissing sections />
          <div className="flex items-center gap-4 mt-7 pt-5" style={{ borderTop: '1px solid rgba(186,230,253,0.35)' }}>
            <button className="btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
            {onRemove && <RemoveButton onConfirm={onRemove} disabled={busy} />}
            {error && <span className="text-xs" style={{ color: '#334155' }}>{error}</span>}
            {savedAt && !error && <span className="text-xs" style={{ color: '#0284C7' }}>Saved.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
