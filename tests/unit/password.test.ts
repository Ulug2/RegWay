import { describe, expect, it } from 'vitest'
import { passwordErrorMessage, passwordProblem, unmetPasswordRules } from '../../src/lib/password'

const unmet = (password: string) => unmetPasswordRules(password).map(r => r.key)

describe('password rules', () => {
  it('accepts a password with length, both cases, a number and a symbol', () => {
    expect(unmet('Harbor!Capital9')).toEqual([])
    expect(passwordProblem('Harbor!Capital9')).toBeNull()
  })

  it('names every rule a password breaks', () => {
    expect(unmet('')).toEqual(['length', 'lower', 'upper', 'digit', 'symbol'])
    expect(unmet('password')).toEqual(['upper', 'digit', 'symbol'])
    expect(unmet('PASSWORD1!')).toEqual(['lower'])
    expect(unmet('Ab1!')).toEqual(['length'])
    expect(unmet('Password12')).toEqual(['symbol'])
  })

  it('does not count a space as a symbol', () => {
    expect(unmet('Harbor Capital9')).toEqual(['symbol'])
  })

  it('states what is missing', () => {
    expect(passwordProblem('password')).toBe('Password needs: an uppercase letter, a number, a symbol (e.g. ! ? # $).')
  })

  it('checks the confirmation only once the password itself is acceptable', () => {
    expect(passwordProblem('Harbor!Capital9', 'Harbor!Capital9')).toBeNull()
    expect(passwordProblem('Harbor!Capital9', 'different')).toBe('Passwords do not match')
    expect(passwordProblem('weak', 'weak')).toMatch(/^Password needs/)
  })
})

describe('passwordErrorMessage', () => {
  it('explains a leaked password', () => {
    expect(passwordErrorMessage({ code: 'weak_password', reasons: ['pwned'], message: 'x' }, 'fallback')).toBe('This password has appeared in a known data breach. Choose a different one.')
  })

  it("explains Supabase's other weak-password refusals", () => {
    expect(passwordErrorMessage({ code: 'weak_password', reasons: ['length', 'characters'] }, 'fallback')).toMatch(/^This password is too weak/)
  })

  it('explains a new password equal to the old one', () => {
    expect(passwordErrorMessage({ code: 'same_password', message: 'x' }, 'fallback')).toBe('The new password must be different from your current one.')
  })

  it("passes other errors through, and falls back when there's no message", () => {
    expect(passwordErrorMessage(new Error('Network down'), 'fallback')).toBe('Network down')
    expect(passwordErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
