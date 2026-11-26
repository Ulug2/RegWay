import { useEffect, useState } from 'react'
import { answerPossibleMatch, fetchPossibleMatches, type PossibleMatch } from '../../lib/data'
import { detailPath } from '../../lib/router'
import CategoryBadge from '../CategoryBadge'
import RouteLink from '../RouteLink'

const fmt = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

// Developments that apply only if one fact RegWay doesn't have is true
// (supabase/functions/_shared/possibleMatch.ts). An answer is saved to the
// fund's, company's or firm's other facts, which every later match reads; a
// yes puts the development on the dashboard. Answering calls no AI.
export default function PossibleMatches({ firmId }: { firmId: string }) {
  const [items, setItems] = useState<PossibleMatch[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    fetchPossibleMatches(firmId)
      .then(setItems)
      .catch(() => {
        setLoadFailed(true)
        setItems([])
      })
  }, [firmId])

  const answer = async (m: PossibleMatch, yes: boolean) => {
    setBusy(m.id)
    setFailed(null)
    try {
      await answerPossibleMatch(m.id, yes)
      // The same question about the same entity is answered everywhere.
      setItems(list => list && list.filter(x => !(x.question === m.question && x.entity === m.entity)))
      setDone(yes ? `Saved. ${m.regulation.title} is now on your dashboard.` : 'Saved. RegWay will take it into account from now on.')
    } catch {
      setFailed(m.id)
    } finally {
      setBusy(null)
    }
  }

  if (items === null) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading questions">
        {[0, 1].map(i => <div key={i} className="glass-card p-5"><div className="skeleton h-4 w-20 mb-3" /><div className="skeleton h-4 w-2/3" /></div>)}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-400)' }}>
        These developments apply only if one thing RegWay doesn't know about you is true. Your answer is saved to your profile and used for every development after it.
      </p>
      {done && <div className="notice" role="status">{done}</div>}
      {loadFailed && <div className="notice is-warn" role="alert">Couldn't load the questions. Reload the page to try again.</div>}
      {!loadFailed && items.length === 0 && <div className="empty-state">No open questions. When a development turns on something RegWay doesn't know about you, it's asked here.</div>}
      {items.map(m => (
        <div key={m.id} className="glass-card p-5">
          <div className="mb-1.5"><CategoryBadge category={m.regulation.category} /></div>
          <RouteLink to={detailPath(m.regulation.id)} className="text-sm font-semibold hover:underline" style={{ color: 'var(--text-900)', lineHeight: 1.5 }}>
            {m.regulation.title}
          </RouteLink>
          <div className="text-[13px] mt-1 num" style={{ color: 'var(--text-400)' }}>
            {m.regulation.jurisdiction || m.regulation.agency || 'Unknown'} · {fmt(m.regulation.effective_date || m.regulation.published_date)}
          </div>
          <p className="text-[15px] font-semibold mt-3" style={{ color: 'var(--text-900)' }}>{m.question}</p>
          <p className="text-[14px] mt-1 leading-relaxed" style={{ color: 'var(--text-600)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-900)' }}>For {m.entity ?? 'your firm'}:</span> {m.reason}
          </p>
          <div className="flex gap-2 mt-4">
            <button className="btn-tool" onClick={() => answer(m, true)} disabled={busy === m.id}>Yes</button>
            <button className="btn-tool" onClick={() => answer(m, false)} disabled={busy === m.id}>No</button>
          </div>
          {failed === m.id && <p className="text-[13px] mt-2" role="alert" style={{ color: 'var(--warning)' }}>Couldn't save your answer. Try again.</p>}
        </div>
      ))}
    </div>
  )
}
