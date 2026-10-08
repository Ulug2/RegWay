import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import { Wordmark } from './PageHeader'
import { Check } from './icons'
import QuestionForm from './questionnaire/QuestionForm'
import AddEntityCard from './profile/AddEntityCard'
import { formatLocation, missingRequired, questionsFor, toRow, type Answers, type LocationValue } from '../lib/questionnaire'

interface OnboardingModalProps {
  onComplete: () => void
}

const STEPS = [
  { n: 1, label: 'Your Firm' },
  { n: 2, label: 'First Fund' },
  { n: 3, label: 'Portfolio' },
]

function AddedList({ items, onRemove, subtitle }: { items: Answers[]; onRemove: (i: number) => void; subtitle: (a: Answers) => string }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'rgb(var(--surface-rgb) / 0.60)', border: '1px solid rgb(var(--line-rgb) / 0.40)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="tile w-8 h-8 text-xs"
              style={{ borderRadius: 8 }}
              aria-hidden="true"
            >
              {String(item.name)[0]}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-900)' }}>{String(item.name)}</div>
              <div className="text-xs truncate" style={{ color: 'var(--text-400)' }}>{subtitle(item)}</div>
            </div>
          </div>
          <button
            onClick={() => onRemove(i)}
            className="btn-tool"
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1)
  const [yourName, setYourName] = useState('')
  const [firm, setFirm] = useState<Answers>({})
  const [funds, setFunds] = useState<Answers[]>([])
  const [companies, setCompanies] = useState<Answers[]>([])
  const [attempted, setAttempted] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const firmMissing = missingRequired('firm', firm, 'onboarding')
  const step1Ready = yourName.trim() !== '' && firmMissing.length === 0

  const next = () => {
    if (step === 1 && !step1Ready) {
      setAttempted(true)
      return
    }
    setStep(s => s + 1)
  }

  const handleComplete = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Generate the id client-side and skip `.select()` on insert: asking
      // PostgREST to return the inserted row would require the SELECT policy
      // to pass immediately, but that policy depends on a firm_members row
      // that doesn't exist yet (chicken-and-egg), which makes the whole
      // insert look like an RLS failure even though it actually succeeded.
      const firmId = crypto.randomUUID()
      const { error: firmError } = await supabase
        .from('firms')
        .insert({ id: firmId, ...toRow('firm', firm), lead_gp_name: yourName.trim() })
      if (firmError) throw firmError

      const { error: memberError } = await supabase.from('firm_members').insert({ user_id: user.id, firm_id: firmId })
      if (memberError) throw memberError

      if (funds.length > 0) {
        const { error } = await supabase.from('funds').insert(funds.map(f => ({ ...toRow('fund', f), firm_id: firmId })))
        if (error) throw error
      }

      if (companies.length > 0) {
        const { error } = await supabase.from('portfolio_companies').insert(companies.map(c => ({ ...toRow('company', c), firm_id: firmId })))
        if (error) throw error
      }

      // Backfill relevance against regulations already synced so the
      // dashboard isn't empty on first load. Fire-and-forget — the dashboard
      // will simply show more items once this finishes in the background.
      callFunction('match-relevance').catch(() => {})
      callFunction('match-enforcement-relevance').catch(() => {})
      callFunction('match-geopolitical-relevance').catch(() => {})

      onComplete()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to save setup'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  const heading = (title: string, sub: string) => (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>{title}</h2>
      <p className="text-sm" style={{ color: 'var(--text-400)' }}>{sub}</p>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgb(var(--ink-rgb) / 0.5)' }}
    >
      <div className="glass-modal w-full max-w-2xl max-h-[92dvh] overflow-y-auto scrollable" role="dialog" aria-modal="true" aria-label="Set up RegWay" style={{ overscrollBehavior: 'contain' }}>
        <div className="p-5 sm:p-8">
          <div className="flex items-center justify-between mb-7">
            <Wordmark size={32} />
            <button onClick={() => supabase.auth.signOut()} className="btn-tool" style={{ fontSize: 13 }}>
              Cancel
            </button>
          </div>

          {/* Progress Pills */}
          <ol className="flex items-center gap-2 mb-8 flex-wrap" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <li key={s.n} className="flex items-center gap-2">
                <button
                  onClick={() => step > s.n && setStep(s.n)}
                  aria-current={step === s.n ? 'step' : undefined}
                  disabled={step < s.n}
                  className="flex items-center gap-2 pl-2 pr-4 py-1.5 text-sm font-medium transition-ui"
                  style={{
                    borderRadius: 9999,
                    background: step === s.n ? 'var(--brand)' : step > s.n ? 'rgb(var(--primary-rgb) / 0.12)' : 'rgb(var(--line-rgb) / 0.25)',
                    color: step === s.n ? 'white' : step > s.n ? 'var(--primary)' : 'var(--text-400)',
                                      }}
                >
                  <span
                    className="w-6 h-6 flex items-center justify-center text-xs font-semibold num"
                    style={{ borderRadius: 9999, background: step === s.n ? 'rgb(255 255 255 / 0.22)' : 'transparent' }}
                  >
                    {step > s.n ? <Check size={13} weight="bold" aria-label="Done" /> : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <div className="w-6 sm:w-8 h-px hidden min-[420px]:block" aria-hidden="true" style={{ background: step > s.n ? 'rgb(var(--primary-rgb) / 0.30)' : 'rgb(var(--line-strong-rgb) / 0.5)' }} />
                )}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <div className="space-y-6">
              {heading('Tell us about your firm', 'Just the essentials. This is what lets RegWay show relevant regulations right away.')}
              <div>
                <label htmlFor="onboarding-name" className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>Your name</label>
                <input id="onboarding-name" name="name" autoComplete="name" className="glass-input-rect" value={yourName} onChange={e => setYourName(e.target.value)} placeholder="e.g. James Whitmore" />
                {attempted && !yourName.trim() && (
                  <span className="badge mt-1.5" style={{ background: 'rgb(var(--primary-rgb) / 0.10)', color: 'var(--primary)' }}>Needed</span>
                )}
              </div>
              <QuestionForm
                questions={questionsFor('firm', 'onboarding')}
                answers={firm}
                onChange={(id, v) => setFirm(a => ({ ...a, [id]: v }))}
                flagMissing={attempted}
                sections
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {heading('Add your first fund', 'Three quick answers. You can add more funds and fill in the rest from your profile any time.')}
              <AddedList
                items={funds}
                onRemove={i => setFunds(f => f.filter((_, j) => j !== i))}
                subtitle={a => [a.structure, formatLocation(a.domicile as LocationValue)].filter(Boolean).join(' · ')}
              />
              <AddEntityCard scope="fund" heading={funds.length ? 'Add another fund' : 'Fund'} cta="Add Fund" onAdd={async a => { setFunds(f => [...f, a]) }} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              {heading('Add your portfolio companies', 'RegWay researches each one for the regulations that touch it. Start with the basics; details can wait.')}
              <AddedList
                items={companies}
                onRemove={i => setCompanies(c => c.filter((_, j) => j !== i))}
                subtitle={a => [a.industry, formatLocation(a.hq as LocationValue)].filter(Boolean).join(' · ')}
              />
              <AddEntityCard scope="company" heading={companies.length ? 'Add another company' : 'Portfolio company'} cta="Add Company" onAdd={async a => { setCompanies(c => [...c, a]) }} />
              <div className="notice">
                <strong style={{ color: 'var(--primary)' }}>Almost there.</strong> After launch, your dashboard will show a short checklist for the remaining
                details (operating locations, products, fund preferences…). The more you add, the sharper your alerts.
              </div>
            </div>
          )}

          {saveError && (
            <div className="notice mt-6" role="alert">
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap mt-8 pt-6" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.35)' }}>
            <div className="text-[13px] num" style={{ color: 'var(--text-400)' }}>
              {step === 1 ? 'Step 1 of 3' : step === 2 ? `${funds.length} fund${funds.length === 1 ? '' : 's'} added` : `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} added`}
            </div>
            <div className="flex items-center gap-3">
              {step > 1 && <button className="btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>}
              {step < 3 ? (
                <button className="btn-primary" onClick={next}>
                  {step === 2 && funds.length === 0 ? 'Skip for now →' : 'Continue →'}
                </button>
              ) : (
                <button className="btn-primary" onClick={handleComplete} disabled={saving}>
                  {saving ? 'Setting up…' : companies.length === 0 ? 'Skip & Launch Dashboard' : 'Launch Dashboard'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
