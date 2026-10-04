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
  // Company-only: current logo (if any) and a handler to upload a new one.
  // Omitted entirely for firm/fund scopes, which have no logo concept.
  logoUrl?: string | null
  onUploadLogo?: (file: File) => Promise<void>
  // Relationship controls that save on their own, outside the questionnaire
  // (e.g. which funds hold a company), shown above the form.
  extra?: React.ReactNode
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024

function LogoUpload({ title, logoUrl, onUpload }: { title: string; logoUrl: string | null | undefined; onUpload: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Image must be under 2MB')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4 mb-6">
      <div
        className="w-14 h-14 shrink-0 flex items-center justify-center text-base font-bold overflow-hidden"
        style={logoUrl ? { borderRadius: 12 } : { background: 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 12, color: 'white' }}
      >
        {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full block object-cover" /> : (title || '?').slice(0, 1).toUpperCase()}
      </div>
      <div>
        <label className="text-xs font-medium px-3 py-1.5 inline-block cursor-pointer" style={{ borderRadius: 9999, border: '1px solid rgba(186,230,253,0.50)', color: '#0284C7', background: 'rgba(255,255,255,0.6)' }}>
          {busy ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} style={{ display: 'none' }} />
        </label>
        {error && <div className="text-xs mt-1" style={{ color: '#334155' }}>{error}</div>}
      </div>
    </div>
  )
}

function formatLastUpdated(iso: unknown): string | null {
  if (typeof iso !== 'string') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `Last updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

// One firm / fund / company: a collapsible glass card holding its full
// questionnaire. Signup answers and "complete later" answers live in the same
// form, with the still-needed required ones softly flagged.
export default function EntityCard({ scope, title, subtitle, row, defaultOpen, onSave, onRemove, logoUrl, onUploadLogo, extra }: EntityCardProps) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [answers, setAnswers] = useState<Answers>(() => fromRow(scope, row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(false)
  // Overrides the (possibly stale, until the parent refetches) `row` prop
  // right after a successful save, so "Last updated" is accurate immediately.
  const [justSavedAt, setJustSavedAt] = useState<string | null>(null)

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
      setJustSavedAt(new Date().toISOString())
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
            {(() => {
              const label = formatLastUpdated(justSavedAt ?? row?.profile_updated_at)
              return label ? ` · ${label}` : ''
            })()}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: '#94a3b8' }}>
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '4px 28px 28px' }}>
          {onUploadLogo && <LogoUpload title={title} logoUrl={logoUrl} onUpload={onUploadLogo} />}
          {extra && <div className="mb-7">{extra}</div>}
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
