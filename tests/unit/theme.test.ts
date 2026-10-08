import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../../src/lib/theme'

describe('which theme applies', () => {
  it('follows the device unless the user chose one', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
