import { useEffect, useState } from 'react'
import { fetchResearch } from '../lib/data'
import type { Finding, ResearchRun } from '../lib/research'
import { MagnifyingGlass } from './icons'

// While a run is going, how often the card looks again.
const POLL_MS = 8000

interface ResearchCardProps {
  firmId: string | null
  firmName: string | undefined
  onReview: () => void
}

// What RegWay's web research on the firm (roadmap item 18) has to show on
// the dashboard: that it is running, what it found waiting for review, or
// why it found nothing. Hidden once nothing is waiting.
export default function ResearchCard({ firmId, firmName, onReview }: ResearchCardProps) {
  const [run, setRun] = useState<ResearchRun | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])

  useEffect(() => {
    if (!firmId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    const load = () =>
      fetchResearch(firmId)
        .then(r => {
          if (!live) return
          setRun(r.run)
          // This card is about the web research; facts a member said are
          // reviewed in Profile → Suggested Facts.
          setFindings(r.findings.filter(f => f.origin === 'web'))
          if (r.run?.status === 'running') timer = setTimeout(load, POLL_MS)
        })
        .catch(() => {})
    load()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [firmId])

  if (!run) return null
  const who = firmName ?? 'your firm'

  if (run.status === 'running') {
    return (
      <div className="notice mb-8 flex items-center gap-2.5" role="status">
        <span className="dot-wobble" style={{ width: 6, height: 6, background: 'var(--primary)' }} aria-hidden="true" />
        Researching {who} on the web. What RegWay finds will be here for you to confirm.
      </div>
    )
  }

  if (findings.length > 0) {
    const facts = findings.filter(f => f.field !== 'new_entity').length
    const entities = findings.length - facts
    const headline = facts ? `RegWay found ${facts} ${facts === 1 ? 'fact' : 'facts'} about ${who} on the web` : `RegWay found ${entities === 1 ? 'a fund or company' : `${entities} funds and companies`} of ${who} on the web`
    const more = facts && entities ? ` It also found ${entities === 1 ? 'a fund or company' : `${entities} funds and companies`} you haven't added.` : ''
    return (
      <div className="glass-card p-5 sm:p-6 mb-8 flex items-center gap-4 flex-wrap">
        <span className="tile shrink-0" aria-hidden="true" style={{ width: 40, height: 40 }}>
          <MagnifyingGlass size={18} />
        </span>
        <div className="flex-1 min-w-[12rem]">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.01em' }}>
            {headline}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-400)', lineHeight: 1.5 }}>
            Each has its source. Nothing is added to your profile until you confirm it.{more}
          </p>
        </div>
        <button className="btn-ghost shrink-0" onClick={onReview}>
          Review
        </button>
      </div>
    )
  }

  // Unsure or failed: said for a week, then left to Profile.
  const recent = !!run.finished_at && Date.now() - Date.parse(run.finished_at) < 7 * 86_400_000
  if ((run.status === 'unsure' || run.status === 'failed') && run.note && recent) {
    return (
      <div className="notice mb-8" role="status">
        RegWay couldn't research {who} on the web: {run.note}{' '}
        <button className="link" onClick={onReview}>
          Try again from Profile
        </button>
      </div>
    )
  }
  return null
}
