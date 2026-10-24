import { useEffect, useState } from 'react'
import { fetchHiddenByReview, restoreHiddenMatch, type HiddenMatch } from '../../lib/data'
import { detailPath } from '../../lib/router'
import CategoryBadge from '../CategoryBadge'
import RouteLink from '../RouteLink'

const fmt = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

// Matches a second AI review (the Skeptic, roadmap item 17) took off the
// dashboard, with its reason. Restoring one is how a wrong rejection is
// undone; each restore is counted against the Skeptic (migration 0040).
export default function HiddenByReview({ firmId }: { firmId: string }) {
  const [items, setItems] = useState<HiddenMatch[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    fetchHiddenByReview(firmId)
      .then(setItems)
      .catch(() => {
        setLoadFailed(true)
        setItems([])
      })
  }, [firmId])

  const restore = async (id: string) => {
    setBusy(id)
    setFailed(null)
    try {
      await restoreHiddenMatch(id)
      setItems(list => list && list.filter(m => m.id !== id))
    } catch {
      setFailed(id)
    } finally {
      setBusy(null)
    }
  }

  if (items === null) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading hidden matches">
        {[0, 1].map(i => <div key={i} className="glass-card p-5"><div className="skeleton h-4 w-20 mb-3" /><div className="skeleton h-4 w-2/3" /></div>)}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-400)' }}>
        After a development is matched to your firm, a second AI review checks the match against your profile. These are the matches it found unsupported and took off your dashboard. If one does apply, restore it.
      </p>
      {loadFailed && <div className="notice is-warn" role="alert">Couldn't load hidden matches. Reload the page to try again.</div>}
      {!loadFailed && items.length === 0 && <div className="empty-state">Nothing hidden by review.</div>}
      {items.map(m => (
        <div key={m.id} className="glass-card flex items-start gap-4 flex-wrap p-5">
          <div className="flex-1 min-w-[14rem]">
            <div className="mb-1.5"><CategoryBadge category={m.regulation.category} /></div>
            <RouteLink to={detailPath(m.regulation.id)} className="text-sm font-semibold hover:underline" style={{ color: 'var(--text-900)', lineHeight: 1.5 }}>
              {m.regulation.title}
            </RouteLink>
            <div className="text-[13px] mt-1 num" style={{ color: 'var(--text-400)' }}>
              {m.regulation.jurisdiction || m.regulation.agency || 'Unknown'} · {fmt(m.regulation.effective_date || m.regulation.published_date)}
            </div>
            <p className="text-[14px] mt-3 leading-relaxed" style={{ color: 'var(--text-600)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-900)' }}>Hidden for {m.entity ?? 'your firm'}:</span> {m.reason}
            </p>
            {failed === m.id && <p className="text-[13px] mt-2" role="alert" style={{ color: 'var(--warning)' }}>Couldn't restore it. Try again.</p>}
          </div>
          <button className="btn-ghost btn-sm shrink-0" onClick={() => restore(m.id)} disabled={busy === m.id}>
            {busy === m.id ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      ))}
    </div>
  )
}
