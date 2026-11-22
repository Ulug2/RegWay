import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEED_LABELS, PUBLISHER_NAMES } from '../../src/lib/sourceList'

// The sync functions decide which sources exist; the app only names them.
// Read the functions' code so a new feed without a name fails here instead
// of showing its raw key ("sec_news") on the dashboard.
const FUNCTIONS = path.resolve(__dirname, '../../supabase/functions')
const syncs = readdirSync(FUNCTIONS).filter(name => name.startsWith('sync-'))
const code = (name: string) => readFileSync(path.join(FUNCTIONS, name, 'index.ts'), 'utf8')

// `const SOURCE = '…'`: what the job records in sync_runs.
const jobSource = (name: string) => code(name).match(/const SOURCE = '([a-z_]+)'/)?.[1]
// `source: '…'`: what a document row carries (a feed list or a row builder).
// sync-regulator-feeds keeps its list of feeds in _shared/regulatorFeeds.ts.
const documentSources = (name: string) => {
  const text = code(name) + (jobSource(name) === 'regulator_feeds' ? readFileSync(path.join(FUNCTIONS, '_shared/regulatorFeeds.ts'), 'utf8') : '')
  return [...text.matchAll(/source: '([a-z_]+)'/g)].map(m => m[1])
}

describe('source names', () => {
  it('finds the sync functions and their sources', () => {
    expect(syncs.length).toBeGreaterThanOrEqual(6)
    for (const name of syncs) expect(jobSource(name), name).toBeTruthy()
  })

  it.each(syncs)('%s has a name for the dashboard when it fails', name => {
    expect(FEED_LABELS[jobSource(name)!]).toBeTruthy()
  })

  it.each(syncs)('%s names the publisher of every document it saves', name => {
    const own = jobSource(name)!
    // A job that fetches one publisher saves its documents under its own source.
    const sources = [...documentSources(name), ...(own === 'regulator_feeds' ? [] : [own])]
    expect(sources.length, name).toBeGreaterThan(0)
    for (const source of sources) expect(PUBLISHER_NAMES[source], `${name}: ${source}`).toBeTruthy()
  })
})
