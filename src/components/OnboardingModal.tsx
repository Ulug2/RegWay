import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import LogoMark from './LogoMark'
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
              className="w-8 h-8 shrink-0 flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,var(--brand),var(--brand-light))', borderRadius: 8, color: 'white' }}
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
            className="text-xs px-3 py-1 rounded-full hover:bg-sky-50 transition-colors"
            style={{ color: 'var(--text-400)', border: '1px solid rgb(var(--line-rgb) / 0.50)' }}
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
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgb(var(--ink-rgb) / 0.35)', backdropFilter: 'blur(6px)' }}
    >
      <div className="glass-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollable">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <LogoMark size={36} />
              <span className="font-semibold text-lg" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>RegWay</span>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-xs font-medium"
              style={{ color: 'var(--text-400)' }}
            >
              Cancel
            </button>
          </div>

          {/* Progress Pills */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <button
                  onClick={() => step > s.n && setStep(s.n)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    borderRadius: 9999,
                    background: step === s.n ? 'linear-gradient(135deg, var(--brand), var(--brand-light))' : step > s.n ? 'rgb(var(--primary-rgb) / 0.12)' : 'rgb(var(--line-rgb) / 0.25)',
                    color: step === s.n ? 'white' : step > s.n ? 'var(--primary)' : 'var(--text-300)',
                    boxShadow: step === s.n ? '0 4px 12px rgb(var(--primary-rgb) / 0.25)' : 'none',
                  }}
                >
                  <span
                    className="w-5 h-5 flex items-center justify-center text-xs font-bold"
                    style={{ borderRadius: 9999, background: step === s.n ? 'rgb(var(--surface-rgb) / 0.25)' : 'transparent' }}
                  >
                    {step > s.n ? '✓' : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <div className="w-8 h-px" style={{ background: step > s.n ? 'rgb(var(--primary-rgb) / 0.30)' : 'rgb(var(--line-rgb) / 0.40)' }} />
                )}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-6">
              {heading('Tell us about your firm', 'Just the essentials — this is what lets RegWay show relevant regulations right away.')}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-600)' }}>Your name</label>
                <input className="glass-input-rect" value={yourName} onChange={e => setYourName(e.target.value)} placeholder="e.g. James Whitmore" />
                {attempted && !yourName.trim() && (
                  <span className="inline-block text-[10px] font-medium px-2 py-0.5 mt-1.5" style={{ borderRadius: 9999, background: 'rgb(var(--primary-rgb) / 0.10)', color: 'var(--primary)' }}>Needed</span>
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
              <div className="p-4 rounded-xl text-sm" style={{ background: 'rgb(var(--primary-rgb) / 0.06)', border: '1px solid rgb(var(--primary-rgb) / 0.12)', color: 'var(--text-600)' }}>
                <strong style={{ color: 'var(--primary)' }}>Almost there.</strong> After launch, your dashboard will show a short checklist for the remaining
                details (operating locations, products, fund preferences…). The more you add, the sharper your alerts.
              </div>
            </div>
          )}

          {saveError && (
            <div className="mt-6 p-3 rounded-lg text-xs" style={{ background: 'rgb(var(--primary-rgb) / 0.06)', border: '1px solid rgb(var(--primary-rgb) / 0.15)', color: 'var(--text-600)' }}>
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.35)' }}>
            <div className="text-xs" style={{ color: 'var(--text-300)' }}>
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
