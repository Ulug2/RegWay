import { useEffect, useState } from 'react'
import { fetchDismissed, restoreRegulation } from '../../lib/data'
import type { Regulation } from '../../lib/types'
import CategoryBadge from '../CategoryBadge'

const fmt = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function DismissedRegulations({ firmId }: { firmId: string }) {
  const [items, setItems] = useState<Regulation[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { fetchDismissed(firmId).then(setItems).catch(() => setItems([])) }, [firmId])

  const restore = async (id: string) => {
    setBusy(id)
    try {
      await restoreRegulation(firmId, id)
      setItems(list => list && list.filter(r => r.id !== id))
    } finally {
      setBusy(null)
    }
  }

  if (items === null) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading dismissed items">
        {[0, 1].map(i => <div key={i} className="glass-card p-5"><div className="skeleton h-4 w-20 mb-3" /><div className="skeleton h-4 w-2/3" /></div>)}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-400)' }}>
        Regulations you dismissed stay hidden from your dashboard and won't come back from new matches. Restore one to bring it back.
      </p>
      {items.length === 0 && <div className="empty-state">Nothing dismissed.</div>}
      {items.map(r => (
        <div key={r.id} className="glass-card flex items-center gap-4 flex-wrap p-5">
          <div className="flex-1 min-w-[14rem]">
            <div className="mb-1.5"><CategoryBadge category={r.category} /></div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-900)', lineHeight: 1.5 }}>{r.title}</div>
            <div className="text-[13px] mt-1 num" style={{ color: 'var(--text-400)' }}>
              {r.jurisdiction || r.agency || 'Unknown'} · {fmt(r.effective_date || r.published_date)}
            </div>
          </div>
          <button className="btn-ghost btn-sm shrink-0" onClick={() => restore(r.id)} disabled={busy === r.id}>
            {busy === r.id ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      ))}
    </div>
  )
}
