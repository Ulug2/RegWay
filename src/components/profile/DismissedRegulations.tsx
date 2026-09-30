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

  if (items === null) return null
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: '#64748B' }}>
        Regulations you dismissed stay hidden from your dashboard and won't come back from new matches. Restore one to bring it back.
      </p>
      {items.length === 0 && <p className="text-sm" style={{ color: '#94a3b8' }}>Nothing dismissed.</p>}
      {items.map(r => (
        <div key={r.id} className="glass-card flex items-center gap-4" style={{ padding: 20 }}>
          <div className="flex-1 min-w-0">
            <div className="mb-1.5"><CategoryBadge category={r.category} /></div>
            <div className="text-sm font-semibold" style={{ color: '#0F172A', lineHeight: 1.5 }}>{r.title}</div>
            <div className="text-xs mt-1" style={{ color: '#64748B' }}>
              {r.jurisdiction || r.agency || 'Unknown'} · {fmt(r.effective_date || r.published_date)}
            </div>
          </div>
          <button className="btn-ghost shrink-0" onClick={() => restore(r.id)} disabled={busy === r.id}>
            {busy === r.id ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      ))}
    </div>
  )
}
