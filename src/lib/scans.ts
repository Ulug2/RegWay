import { callFunction } from './functions'
import { clearCompanyResults, fetchCompanyRegulations, fetchPortfolioCompanies, getCachedCompanies, rescanRequested } from './data'
import { patchCache, readCache, writeCache } from './cache'
import type { PortfolioCompany, Regulation } from './types'

// Portfolio-company regulation scans (Claude + web search, ~30-60s each) run
// in the background so results are already stored by the time someone opens a
// company. A company needs a scan when it has never been scanned, its details
// changed (the save marks it for a new scan), or its last scan is a week old.

// A scan costs AI money, so one called for by an edit waits until the
// company's profile has gone five minutes without another save (roadmap
// 16b.2): someone correcting several answers in a row pays for one scan. A
// company just added is scanned at once.

const STALE_MS = 7 * 24 * 60 * 60 * 1000
const CONCURRENCY = 2
export const QUIET_MS = 5 * 60 * 1000
// A save this soon after the company was created is the creation itself.
const CREATION_MS = 30 * 1000

type ScanFacts = Pick<PortfolioCompany, 'last_scanned_at'> & Partial<Pick<PortfolioCompany, 'profile_updated_at' | 'created_at'>>

const wantsScan = (c: ScanFacts, now: number) => !c.last_scanned_at || now - Date.parse(c.last_scanned_at) > STALE_MS

// When a company that wants a scan may have it: now (0), or the moment its
// last edit will be five minutes old.
export function scanDueAt(c: ScanFacts, now = Date.now()): number {
  const edited = c.profile_updated_at ? Date.parse(c.profile_updated_at) : NaN
  if (Number.isNaN(edited)) return 0
  const created = c.created_at ? Date.parse(c.created_at) : NaN
  if (!Number.isNaN(created) && edited - created < CREATION_MS) return 0
  return edited + QUIET_MS <= now ? 0 : edited + QUIET_MS
}

export const needsScan = (c: ScanFacts, now = Date.now()) => wantsScan(c, now) && scanDueAt(c, now) === 0

const inflight = new Map<string, Promise<boolean>>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

export const isScanning = (companyId: string) => inflight.has(companyId)

// Called whenever a scan starts or finishes.
export function onScanChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export class RateLimited extends Error {}

// Scans one company (deduplicated) and stores the result in the cache so the
// dashboard can render it instantly. Resolves false if the scan failed.
export function scanCompany(firmId: string, companyId: string): Promise<boolean> {
  const running = inflight.get(companyId)
  if (running) return running

  const run = (async () => {
    try {
      // Details changed since the last scan (the save marked it): what
      // that scan found goes, now that its replacement is starting.
      const company = getCachedCompanies()?.find(c => c.id === companyId)
      if (company && rescanRequested(company)) await clearCompanyResults(firmId, companyId)
      await callFunction('company-regulations', { companyId })
      const regs = await fetchCompanyRegulations(firmId, companyId)
      writeCache('regs:company', { ...(readCache<Record<string, Regulation[]>>('regs:company') ?? {}), [companyId]: regs })
      patchCache<PortfolioCompany[]>('companies', prev =>
        prev.map(c => (c.id === companyId ? { ...c, last_scanned_at: new Date().toISOString() } : c)),
      )
      return true
    } catch (err) {
      if (err instanceof Error && /rate limit/i.test(err.message)) throw new RateLimited(err.message)
      return false
    } finally {
      inflight.delete(companyId)
      notify()
    }
  })()

  inflight.set(companyId, run)
  notify()
  return run
}

let prewarming = false
let rerun = false
let waiting: ReturnType<typeof setTimeout> | undefined

// Comes back for companies whose scan is waiting out the five minutes, if
// the app is still open then.
function scheduleWaiting(firmId: string, companies: PortfolioCompany[]): void {
  const now = Date.now()
  const due = companies.filter(c => wantsScan(c, now)).map(c => scanDueAt(c, now)).filter(at => at > 0)
  clearTimeout(waiting)
  if (due.length) waiting = setTimeout(() => void prewarmCompanies(firmId), Math.min(...due) - now + 1000)
}

// Scans every company that needs it, a couple at a time, and stops early if
// the per-user rate limit is hit (the rest are picked up on a later visit).
export async function prewarmCompanies(firmId: string, known?: PortfolioCompany[]): Promise<void> {
  if (prewarming) {
    rerun = true
    return
  }
  prewarming = true
  try {
    do {
      rerun = false
      const companies = known ?? (await fetchPortfolioCompanies(firmId))
      scheduleWaiting(firmId, companies)
      const queue = companies.filter(c => needsScan(c) && !inflight.has(c.id)).map(c => c.id)
      let stop = false
      const worker = async () => {
        while (!stop) {
          const id = queue.shift()
          if (!id) return
          try {
            await scanCompany(firmId, id)
          } catch {
            stop = true
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      known = undefined
    } while (rerun)
  } finally {
    prewarming = false
  }
}
