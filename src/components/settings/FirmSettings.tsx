import { useEffect, useState } from 'react'
import { fetchFirm, updateFirm } from '../../lib/data'
import { JURISDICTIONS } from '../../lib/options'
import TagInput from '../TagInput'

export default function FirmSettings({ firmId }: { firmId: string }) {
  const [name, setName] = useState('')
  const [hq, setHq] = useState('')
  const [jurisdictions, setJurisdictions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchFirm(firmId).then(f => {
      setName(f.name)
      setHq(f.hq_location ?? '')
      setJurisdictions(f.jurisdictions ?? [])
    })
  }, [firmId])

  const save = async () => {
    if (!name.trim()) {
      setError('Firm name is required')
      return
    }
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      await updateFirm(firmId, { name: name.trim(), hq_location: hq.trim() || null, jurisdictions })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card" style={{ padding: 28 }}>
      <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Firm details</h2>
      <p className="text-xs mb-5" style={{ color: '#94a3b8' }}>Used to decide which regulations are relevant to your firm.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Firm name</label>
          <input className="glass-input-rect" value={name} onChange={e => { setName(e.target.value); setSaved(false) }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>HQ location</label>
          <input className="glass-input-rect" value={hq} onChange={e => { setHq(e.target.value); setSaved(false) }} placeholder="e.g. New York, NY" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Operating jurisdictions</label>
          <TagInput
            tags={jurisdictions}
            onAdd={j => { setJurisdictions(x => [...x, j]); setSaved(false) }}
            onRemove={j => { setJurisdictions(x => x.filter(y => y !== j)); setSaved(false) }}
            placeholder="Select jurisdictions..."
            options={JURISDICTIONS}
          />
        </div>
      </div>
      <div className="flex items-center gap-4 mt-5">
        <button className="btn-primary" onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
        {error && <span className="text-xs" style={{ color: '#334155' }}>{error}</span>}
        {saved && <span className="text-xs" style={{ color: '#0284C7' }}>Saved.</span>}
      </div>
    </div>
  )
}
