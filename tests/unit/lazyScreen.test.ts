import { describe, expect, it, vi } from 'vitest'
import { reloadOnceForNewBuild } from '../../src/lib/lazyScreen'

const memoryStorage = () => {
  const items = new Map<string, string>()
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) }
}

describe('reloadOnceForNewBuild', () => {
  it('reloads the first time a screen fails to load, and not again in the same tab', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    expect(reloadOnceForNewBuild(storage, reload)).toBe(true)
    expect(reloadOnceForNewBuild(storage, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads when storage is blocked, so it cannot loop', () => {
    const reload = vi.fn()
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(reloadOnceForNewBuild(blocked, reload)).toBe(false)
    expect(reloadOnceForNewBuild(null, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
