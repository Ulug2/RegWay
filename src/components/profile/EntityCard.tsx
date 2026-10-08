import { useEffect, useState } from 'react'
import QuestionForm from '../questionnaire/QuestionForm'
import RemoveButton from './RemoveButton'
import ProgressRing from '../ProgressRing'
import { fromRow, isEmpty, isFact, isStale, metaOf, missingRequired, questionsFor, requiredCount, sameAnswer, type Answers, type ProfileMeta, type Question, type Scope } from '../../lib/questionnaire'
import type { FactProvenance } from '../questionnaire/QuestionField'

interface EntityCardProps {
  scope: Scope
  title: string
  subtitle?: string
  row: Record<string, unknown> | null
  defaultOpen?: boolean
  // `meta`: the form's provenance edits (confirmations, documents).
  onSave: (answers: Answers, meta: ProfileMeta) => Promise<void>
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

  // Where each answer came from and when it was last confirmed, as edited
  // here (a fact confirmed, a document named); saved with the answers.
  const [meta, setMeta] = useState<ProfileMeta>(() => metaOf(row))

  // Fresh server data replaces the form unless the user is mid-edit.
  useEffect(() => {
    if (dirty) return
    setAnswers(fromRow(scope, row))
    setMeta(metaOf(row))
  }, [row])

  const saved = fromRow(scope, row)
  const facts = questionsFor(scope).filter(isFact)
  const answered = facts.filter(q => !isEmpty(answers[q.id]))
  const due = answered.filter(q => isStale(meta[q.id])).length

  const editMeta = (next: ProfileMeta) => {
    setMeta(next)
    setDirty(true)
    setSavedAt(false)
  }
  const confirmedNow = (id: string, at: string) => ({ ...(meta[id] ?? { source: 'user' as const }), confirmed_at: at })
  const provenance = (q: Question): FactProvenance | undefined =>
    isFact(q)
      ? {
          meta: meta[q.id],
          recordedBy: row?.profile_updated_at as string | null | undefined,
          changed: !sameAnswer(saved[q.id], answers[q.id]),
          onConfirm: () => editMeta({ ...meta, [q.id]: confirmedNow(q.id, new Date().toISOString()) }),
          // Naming the document a fact rests on is a confirmation of it.
          onDocument: document => {
            const confirmed_at = new Date().toISOString()
            editMeta({ ...meta, [q.id]: document ? { source: 'document', document, confirmed_at } : { source: 'user', confirmed_at } })
          },
        }
      : undefined
  const confirmAll = () => {
    const at = new Date().toISOString()
    editMeta({ ...meta, ...Object.fromEntries(answered.map(q => [q.id, confirmedNow(q.id, at)])) })
  }

  const total = requiredCount(scope, answers)
  const left = missingRequired(scope, answers).length
  const percent = total === 0 ? 100 : ((total - left) / total) * 100

  const change = (id: string, value: unknown) => {
    setAnswers(a => ({ ...a, [id]: value }))
    // A document that backed the old value says nothing about the new one.
    if (meta[id]?.document) setMeta(m => ({ ...m, [id]: { source: 'user', confirmed_at: m[id].confirmed_at } }))
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
      await onSave(answers, meta)
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
            {due > 0 ? ` · ${due} ${due === 1 ? 'answer' : 'answers'} not confirmed in over a year` : ''}
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
          <p className="text-xs mb-6" style={{ color: '#64748B', lineHeight: 1.6 }}>
            Each answer shows where it came from and when it was last confirmed. A blank answer is treated as unknown, never as “no”.
          </p>
          <QuestionForm questions={questionsFor(scope)} answers={answers} onChange={change} flagMissing sections provenance={provenance} />
          <div className="flex items-center gap-4 mt-7 pt-5" style={{ borderTop: '1px solid rgba(186,230,253,0.35)' }}>
            <button className="btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
            {answered.length > 0 && (
              <button className="btn-ghost" onClick={confirmAll} disabled={busy} title="Marks every answer above as confirmed today; applied when you save.">
                Confirm all answers are current
              </button>
            )}
            {onRemove && <RemoveButton onConfirm={onRemove} disabled={busy} />}
            {error && <span className="text-xs" style={{ color: '#334155' }}>{error}</span>}
            {savedAt && !error && (
              <span className="text-xs" style={{ color: '#0284C7' }}>
                Saved. Matches and analyses update a few minutes after your last change.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
