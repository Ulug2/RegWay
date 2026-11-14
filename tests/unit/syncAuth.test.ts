import { describe, expect, it } from 'vitest'
import { fakeClient, setClient } from './helpers/fakeSupabase'
import { loadHandler, post, stubFetch } from './helpers/handler'

// The public key is in every browser: a sync that accepted it could be run
// by anyone, as often as they liked (and sync-sec-admin-proceedings spends
// AI credit on every new item). Only the service key runs them now.
const SYNCS = ['sync-federal-register', 'sync-regulator-feeds', 'sync-sec-enforcement', 'sync-finra-enforcement', 'sync-sec-admin-proceedings', 'sync-travel-advisories']

describe('sync functions', () => {
  it.each(SYNCS)('%s refuses the public key and no key, before fetching anything', async name => {
    setClient(fakeClient())
    const { handler } = await loadHandler(name)
    const calls = stubFetch(() => undefined)
    for (const token of ['test-anon-key', undefined]) {
      const res = await handler(post(name, { token }))
      expect(res.status).toBe(401)
    }
    expect(calls).toHaveLength(0)
  })
})
