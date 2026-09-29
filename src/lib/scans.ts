import { callFunction } from './functions'
import { fetchCompanyRegulations, fetchPortfolioCompanies } from './data'
import { patchCache, readCache, writeCache } from './cache'
import type { PortfolioCompany, Regulation } from './types'

// Portfolio-company regulation scans (Claude + web search, ~30-60s each) run
// in the background so results are already stored by the time someone opens a
// company. A company needs a scan when it has never been scanned, its details
// changed (which clears last_scanned_at), or its last scan is a week old.

const STALE_MS = 7 * 24 * 60 * 60 * 1000
const CONCURRENCY = 2

export const needsScan = (c: Pick<PortfolioCompany, 'last_scanned_at'>) =>
  !c.last_scanned_at || Date.now() - Date.parse(c.last_scanned_at) > STALE_MS

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
