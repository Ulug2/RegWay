import { useEffect, useState } from 'react'
import { fetchMatchAlerts, setMatchAlerts } from '../../lib/data'
import Chip from '../Chip'
import { CheckCircle } from '../icons'

// Profile → Account: whether RegWay emails this person when something new
// matches their firm, a fund or a portfolio company (send-match-alerts).
export default function EmailAlerts() {
  const [on, setOn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchMatchAlerts()
      .then(value => live && setOn(value))
      .catch(() => live && setError("Couldn't load your email setting."))
    return () => {
      live = false
    }
  }, [])

  const choose = async (next: boolean) => {
    if (next === on || saving) return
    const before = on
    setOn(next)
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await setMatchAlerts(next)
      setSaved(true)
    } catch {
      setOn(before)
      setError("Couldn't save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card p-6 sm:p-7">
      <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-900)' }}>Email alerts</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-600)' }}>
        An email when something new applies to your firm, a fund or a portfolio company. It lists the headlines; the reasons and analyses are on your dashboard.
      </p>
      {on === null && !error ? (
        <div className="skeleton h-9 w-32" aria-hidden="true" />
      ) : (
        on !== null && (
          <div className="flex gap-2" role="radiogroup" aria-label="Email alerts">
            <Chip selected={on} onClick={() => choose(true)}>On</Chip>
            <Chip selected={!on} onClick={() => choose(false)}>Off</Chip>
          </div>
        )
      )}
      {error && <div className="text-[13px] mt-3" role="alert" style={{ color: 'var(--warning)' }}>{error}</div>}
      {saved && (
        <div className="text-[13px] mt-3 flex items-center gap-1.5 font-medium" aria-live="polite" style={{ color: 'var(--primary)' }}>
          <CheckCircle size={15} weight="fill" aria-hidden="true" />
          {on ? 'Saved. You’ll get an email when something new applies.' : 'Saved. No alert emails.'}
        </div>
      )}
    </div>
  )
}
