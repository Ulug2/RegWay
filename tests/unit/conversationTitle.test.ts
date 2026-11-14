import { describe, expect, it } from 'vitest'
import { CONVERSATION_TITLE_MAX, conversationTitle } from '../../src/lib/data'

describe('conversation titles', () => {
  it('trims a title down to one line', () => {
    expect(conversationTitle('  Filing dates  ')).toBe('Filing dates')
    expect(conversationTitle('Form\nPF   deadlines')).toBe('Form PF deadlines')
  })

  it('refuses a blank title', () => {
    expect(() => conversationTitle('')).toThrow('Enter a title.')
    expect(() => conversationTitle('   ')).toThrow('Enter a title.')
  })

  it('cuts a title at the same length as an automatic one', () => {
    const long = 'a'.repeat(CONVERSATION_TITLE_MAX + 25)
    expect(conversationTitle(long)).toHaveLength(CONVERSATION_TITLE_MAX)
    expect(conversationTitle(long)).toBe('a'.repeat(CONVERSATION_TITLE_MAX))
  })
})
