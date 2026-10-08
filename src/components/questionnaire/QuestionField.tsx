import { useState } from 'react'
import TagInput from '../TagInput'
import { COUNTRIES, RECOMMENDED, US_STATES, emptyLocation, isEmpty, isStale, type FactMeta, type LocationValue, type Question } from '../../lib/questionnaire'
import Chip from '../Chip'

const CHIP_LIMIT = 24

function FreeTags({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const t = draft.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setDraft('')
  }
  return (
    <div
      className="flex flex-wrap gap-2 p-2"
      style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(186,230,253,0.50)', borderRadius: 10, minHeight: 44 }}
    >
      {value.map(tag => (
        <span
          key={tag}
          className="flex items-center gap-1 px-3 py-1 text-xs font-medium"
          style={{ background: 'rgba(2,132,199,0.10)', color: '#0284C7', borderRadius: 9999, border: '1px solid rgba(2,132,199,0.20)' }}
        >
          {tag}
          <button type="button" className="ml-1 hover:opacity-60" onClick={() => onChange(value.filter(t => t !== tag))}>×</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-sm px-1"
        style={{ color: '#0F172A' }}
      />
    </div>
  )
}

function LocationField({ question, value, onChange }: { question: Question; value: LocationValue; onChange: (v: LocationValue) => void }) {
  const isUS = value.country === 'United States'
  const askCity = question.id !== 'domicile'
  const listId = `countries-${question.scope}-${question.id}`
  return (
    <div className={`grid gap-3 ${askCity ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
      <div>
        <input
          className="glass-input-rect"
          list={listId}
          placeholder="Country"
          value={value.country}
          onChange={e => onChange({ ...value, country: e.target.value, state: e.target.value === 'United States' ? value.state : '' })}
        />
        <datalist id={listId}>{COUNTRIES.map(c => <option key={c} value={c} />)}</datalist>
      </div>
      {isUS ? (
        <select className="glass-input-rect" value={value.state} onChange={e => onChange({ ...value, state: e.target.value })}>
          <option value="">State</option>
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input className="glass-input-rect" placeholder="State / province" value={value.state} onChange={e => onChange({ ...value, state: e.target.value })} />
      )}
      {askCity && (
        <input className="glass-input-rect" placeholder="City" value={value.city} onChange={e => onChange({ ...value, city: e.target.value })} />
      )}
    </div>
  )
}

// Where one answer came from and when it was last confirmed (roadmap item
// 16), with the two things a user can do about it. Given on the Profile
// forms only; signup and "add" forms have nothing recorded yet.
export interface FactProvenance {
  meta?: FactMeta
  // For an answer from before provenance was kept: the latest it can have
  // been entered (the profile's last save).
  recordedBy?: string | null
  // The answer in the form differs from the saved one.
  changed: boolean
  onConfirm: () => void
  onDocument: (document: string) => void
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const linkStyle = { color: '#0284C7' }

function FactLine({ fact, label }: { fact: FactProvenance; label: string }) {
  const { meta } = fact
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(meta?.document ?? '')
  const stale = isStale(meta)
  const validDate = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(Date.parse(iso))

  const origin = fact.changed
    ? `Edited: recorded ${meta?.document ? `from “${meta.document}”` : 'as entered by you'} today when you save`
    : meta
      ? `${meta.source === 'document' ? `From a document: ${meta.document}` : 'Entered by you'} · ${stale ? `last confirmed ${shortDate(meta.confirmed_at)}, over a year ago` : `confirmed ${shortDate(meta.confirmed_at)}`}`
      : `Recorded ${validDate(fact.recordedBy) ? `on or before ${shortDate(fact.recordedBy)}` : 'earlier'} · not confirmed since`

  const apply = () => {
    fact.onDocument(draft.trim())
    setEditing(false)
  }

  return (
    <div className="mt-1.5 text-[11px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5" style={{ color: stale ? '#B45309' : '#94a3b8' }} data-fact-line>
      <span>{origin}</span>
      {!fact.changed && (stale || !meta) && (
        <button type="button" className="underline" style={linkStyle} onClick={fact.onConfirm} aria-label={`Confirm ${label} is still correct`}>
          Still correct
        </button>
      )}
      <button type="button" className="underline" style={linkStyle} onClick={() => setEditing(e => !e)} aria-label={`Supporting document for ${label}`}>
        {meta?.document ? 'Change document' : 'Add document'}
      </button>
      {editing && (
        <div className="flex gap-2 mt-1.5 basis-full">
          <input
            className="glass-input-rect"
            style={{ fontSize: 12 }}
            placeholder="Supporting document: its name or a link (blank to remove)"
            aria-label={`Document name or link for ${label}`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              }
            }}
          />
          <button type="button" className="btn-ghost" onClick={apply}>Apply</button>
        </div>
      )}
    </div>
  )
}

interface QuestionFieldProps {
  question: Question
  value: unknown
  onChange: (value: unknown) => void
  // Marks a still-unanswered required question with a soft "Needed" hint.
  flagMissing?: boolean
  fact?: FactProvenance
}

export default function QuestionField({ question: q, value, onChange, flagMissing, fact }: QuestionFieldProps) {
  const shown = isEmpty(value) && q.defaultValue !== undefined ? q.defaultValue : value
  const missing = flagMissing && q.required && isEmpty(shown)

  let control: React.ReactNode = null
  switch (q.type) {
    case 'text':
    case 'url':
      control = (
        <input
          className="glass-input-rect"
          type={q.type === 'url' ? 'url' : 'text'}
          value={(shown as string) ?? ''}
          placeholder={q.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )
      break
    case 'number':
    case 'year':
      control = (
        <input
          className="glass-input-rect"
          inputMode="numeric"
          value={(shown as string) ?? ''}
          placeholder={q.placeholder}
          onChange={e => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, q.type === 'year' ? 4 : 9))}
        />
      )
      break
    case 'select':
      control = (
        <select className="glass-input-rect" value={(shown as string) ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">Select…</option>
          {q.options!.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
      break
    case 'yesno':
      control = (
        <div className="flex gap-2">
          {(['yes', 'no'] as const).map(v => (
            <Chip key={v} selected={shown === v} onClick={() => onChange(shown === v ? '' : v)}>{v === 'yes' ? 'Yes' : 'No'}</Chip>
          ))}
        </div>
      )
      break
    case 'multi': {
      const selected = (shown as string[] | undefined) ?? []
      const toggle = (o: string) => {
        if (selected.includes(o)) return onChange(selected.filter(x => x !== o))
        if (o === RECOMMENDED || o === 'None') return onChange([o])
        onChange([...selected.filter(x => x !== RECOMMENDED && x !== 'None'), o])
      }
      control =
        q.options!.length > CHIP_LIMIT ? (
          <TagInput tags={selected} onAdd={toggle} onRemove={toggle} placeholder="Select…" options={q.options!} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {q.options!.map(o => <Chip key={o} selected={selected.includes(o)} onClick={() => toggle(o)}>{o}</Chip>)}
          </div>
        )
      break
    }
    case 'tags':
      control = <FreeTags value={(shown as string[] | undefined) ?? []} onChange={onChange} placeholder={q.placeholder} />
      break
    case 'location':
      control = <LocationField question={q} value={(shown as LocationValue | undefined) ?? emptyLocation()} onChange={onChange} />
      break
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 min-h-[20px]">
        <label className="block text-xs font-medium" style={{ color: '#334155' }}>{q.label}</label>
        {!q.required && <span className="text-[10px]" style={{ color: '#94a3b8' }}>Optional</span>}
        {missing && (
          <span
            className="text-[10px] font-medium px-2 py-0.5"
            style={{ borderRadius: 9999, background: 'rgba(2,132,199,0.10)', color: '#0284C7' }}
          >
            Needed
          </span>
        )}
        {fact && !missing && isEmpty(shown) && (
          // A blank answer is a gap in what RegWay knows, not a "no".
          <span
            className="text-[10px] font-medium px-2 py-0.5"
            style={{ borderRadius: 9999, background: 'rgba(100,116,139,0.10)', color: '#64748B' }}
            title="Not recorded. RegWay treats a blank answer as unknown, not as “no” or “none”."
          >
            Unknown
          </span>
        )}
      </div>
      {control}
      {fact && !isEmpty(shown) && <FactLine fact={fact} label={q.label} />}
      {q.help && <p className="text-[11px] mt-1.5" style={{ color: '#94a3b8' }}>{q.help}</p>}
    </div>
  )
}
