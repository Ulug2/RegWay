import { useCallback, useEffect, useState } from 'react'
import { addFoundEntity, confirmFinding, fetchFunds, fetchPortfolioCompanies, fetchResearch, getCachedFirm, rejectFinding, startResearch } from '../../lib/data'
import { addedTo, groupFindings, hostOf, isNewEntity, questionOf, showValue, type Finding, type FoundEntity, type ResearchRun } from '../../lib/research'
import { ArrowSquareOut } from '../icons'

const POLL_MS = 8000
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

interface Loaded {
  run: ResearchRun | null
  findings: Finding[]
  funds: { id: string; name: string }[]
  companies: { id: string; name: string }[]
}

// What RegWay's web research (roadmap item 18) found about the firm, its
// funds and its companies, each with its source, for the user to confirm
// into the profile or set aside. Nothing here is in the profile until it
// is confirmed.
export default function FoundOnWeb({ firmId }: { firmId: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [research, funds, companies] = await Promise.all([fetchResearch(firmId), fetchFunds(firmId), fetchPortfolioCompanies(firmId)])
      setData({ ...research, funds, companies })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load what was found')
    }
  }, [firmId])

  useEffect(() => {
    load()
  }, [load])

  // A run in progress: look again until it ends.
  useEffect(() => {
    if (data?.run?.status !== 'running') return
    const timer = setTimeout(load, POLL_MS)
    return () => clearTimeout(timer)
  }, [data, load])

  const act = async (f: Finding, work: () => Promise<void>) => {
    setBusy(f.id)
    setError(null)
    try {
      await work()
      setData(d => d && { ...d, findings: d.findings.filter(x => x.id !== f.id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const researchAgain = async () => {
    setStarting(true)
    setError(null)
    try {
      await startResearch()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the research')
    } finally {
      setStarting(false)
    }
  }

  if (data === null) {
    return error ? (
      <div className="notice is-warn" role="alert">{error}</div>
    ) : (
      <div className="space-y-4" role="status" aria-label="Loading what was found">
        {[0, 1].map(i => <div key={i} className="glass-card p-5"><div className="skeleton h-4 w-24 mb-3" /><div className="skeleton h-4 w-2/3" /></div>)}
      </div>
    )
  }

  const { run, findings } = data
  const groups = groupFindings(findings, getCachedFirm()?.name ?? 'Your firm', data.funds, data.companies)
  const found = findings.filter(isNewEntity)
  const running = run?.status === 'running'

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 flex-wrap">
        <p className="text-sm flex-1 min-w-[16rem]" style={{ color: 'var(--text-400)', lineHeight: 1.6 }}>
          RegWay searches public pages (your website, SEC filings, the press) for facts about your firm, funds and companies. Each finding shows where it came from. Nothing is added to your profile until you confirm it; until then only RegWay AI sees it, marked as unconfirmed.
        </p>
        <button className="btn-ghost btn-sm shrink-0" onClick={researchAgain} disabled={starting || running}>
          {running ? 'Researching…' : starting ? 'Starting…' : 'Research Again'}
        </button>
      </div>

      {running && (
        <div className="notice flex items-center gap-2.5" role="status">
          <span className="dot-wobble" style={{ width: 6, height: 6, background: 'var(--primary)' }} aria-hidden="true" />
          Researching on the web. This takes about a minute.
        </div>
      )}
      {!running && run && (run.status === 'unsure' || run.status === 'failed') && run.note && (
        <div className="notice is-warn" role="status">
          The last research ({fmt(run.started_at)}) found nothing to propose: {run.note}
        </div>
      )}
      {error && <div className="notice is-warn" role="alert">{error}</div>}

      {!running && groups.length === 0 && found.length === 0 && (
        <div className="empty-state">{run ? 'Nothing waiting for review. Run the research again after you add funds or companies.' : 'No research has run yet. Start one to see what RegWay finds about your firm.'}</div>
      )}

      {groups.map(g => (
        <section key={`${g.scope}-${g.entityId}`} aria-label={`Found about ${g.name}`}>
          <h3 className="section-label mb-2">{g.name}</h3>
          <div className="glass-card rows">
            {g.findings.map(f => (
              <FindingRow key={f.id} finding={f} busy={busy === f.id} onConfirm={() => act(f, () => confirmFinding(firmId, f))} onReject={() => act(f, () => rejectFinding(f.id))} />
            ))}
          </div>
        </section>
      ))}

      {found.length > 0 && (
        <section aria-label="Also found">
          <h3 className="section-label mb-2">Also found: funds and companies you haven't added</h3>
          <div className="glass-card rows">
            {found.map(f => {
              const e = f.value as FoundEntity
              return (
                <div key={f.id} className="p-4 sm:p-5 flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[14rem]">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-900)' }}>
                      {e.name} <span className="badge ml-1">{f.scope === 'fund' ? 'Fund' : 'Company'}</span>
                    </div>
                    {e.description && <p className="text-sm mt-1" style={{ color: 'var(--text-600)', lineHeight: 1.6 }}>{e.description}</p>}
                    <Source url={f.source_url} />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn-tool is-accent" onClick={() => act(f, () => addFoundEntity(firmId, f))} disabled={busy === f.id}>
                      {busy === f.id ? 'Adding…' : 'Add'}
                    </button>
                    <button className="btn-tool" onClick={() => act(f, () => rejectFinding(f.id))} disabled={busy === f.id}>
                      Not Ours
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function Source({ url, quote }: { url: string; quote?: string }) {
  return (
    <div className="text-xs mt-1.5" style={{ color: 'var(--text-400)', lineHeight: 1.5 }}>
      {quote && <span>“{quote}” · </span>}
      <a className="link inline-flex items-center gap-1" href={url} target="_blank" rel="noopener noreferrer">
        {hostOf(url)}
        <ArrowSquareOut size={12} aria-hidden="true" />
      </a>
    </div>
  )
}

function FindingRow({ finding: f, busy, onConfirm, onReject }: { finding: Finding; busy: boolean; onConfirm: () => void; onReject: () => void }) {
  const q = questionOf(f)
  const added = addedTo(f)
  const conflict = f.recorded != null && !added
  return (
    <div className="p-4 sm:p-5 flex items-start gap-4 flex-wrap">
      <div className="flex-1 min-w-[14rem]">
        <div className="text-[13px]" style={{ color: 'var(--text-400)' }}>{q?.label ?? f.field}</div>
        <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-900)', lineHeight: 1.5 }}>
          {added ? `Adds: ${added.join(', ')}` : showValue(f.value)}
        </div>
        {conflict && (
          <div className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
            Your profile says: {showValue(f.recorded)}
          </div>
        )}
        <Source url={f.source_url} quote={f.quote} />
      </div>
      <div className="flex gap-2 shrink-0">
        <button className="btn-tool is-accent" onClick={onConfirm} disabled={busy} aria-label={`Confirm ${q?.label ?? f.field}`}>
          {busy ? 'Saving…' : conflict ? 'Use This' : 'Confirm'}
        </button>
        <button className="btn-tool" onClick={onReject} disabled={busy} aria-label={`Not right: ${q?.label ?? f.field}`}>
          Not Right
        </button>
      </div>
    </div>
  )
}
