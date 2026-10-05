import type { Page } from '@playwright/test'
import { aiReply, expect, signIn, test, USER, FIRM_ID, type MockBackend } from './mockBackend'

const ASK = 'Ask RegWay AI about regulatory impact, compliance obligations, or fund exposure...'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const chatCalls = (backend: MockBackend) => backend.called('POST', 'functions/v1/regway-ai-chat').map(c => c.body)

async function openCopilot(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
  await expect(page.getByText('RegWay AI Copilot')).toBeVisible()
}

async function ask(page: Page, question: string) {
  await page.getByPlaceholder(ASK).fill(question)
  await page.getByPlaceholder(ASK).press('Enter')
}

test.describe('RegWay AI chat', () => {
  test('sends a question and shows the streamed answer', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('Two Medicare rules are **matched** to GetixHealth.') })
    await openCopilot(page)
    await expect(page.getByText('Grounded in live web search for Harbor Capital')).toBeVisible()

    await ask(page, "What's relevant to us right now?")
    await expect(page.getByText("What's relevant to us right now?")).toBeVisible()
    await expect(page.getByText('Two Medicare rules are matched to GetixHealth.')).toBeVisible()
    await expect(page.locator('strong', { hasText: 'matched' })).toBeVisible()

    const [call] = chatCalls(backend)
    expect(call.message).toBe("What's relevant to us right now?")
    expect(call.conversationId).toMatch(UUID)
    expect(call.context ?? null).toBeNull()
  })

  test('keeps follow-ups in the same conversation, and "New chat" starts another', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = ({ message }) => ({ sse: aiReply(`Answer to: ${message}`) })
    await openCopilot(page)

    await ask(page, 'First question')
    await expect(page.getByText('Answer to: First question')).toBeVisible()
    await ask(page, 'Second question')
    await expect(page.getByText('Answer to: Second question')).toBeVisible()

    await page.getByRole('button', { name: 'New chat' }).click()
    await expect(page.getByText('Answer to: First question')).toHaveCount(0)
    await ask(page, 'Third question')
    await expect(page.getByText('Answer to: Third question')).toBeVisible()

    const [first, second, third] = chatCalls(backend)
    expect(second.conversationId).toBe(first.conversationId)
    expect(third.conversationId).toMatch(UUID)
    expect(third.conversationId).not.toBe(first.conversationId)
  })

  test('opens already focused on the company whose page is showing', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('The Medicare payment update.') })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'G GetixHealth Healthcare' }).click()
    await page.getByPlaceholder('Ask RegWay AI about GetixHealth...').click()

    await expect(page.getByText('Focused on GetixHealth')).toBeVisible()
    await ask(page, "What's relevant to this company?")
    await expect(page.getByText('The Medicare payment update.')).toBeVisible()
    expect(chatCalls(backend)[0].context).toEqual({ type: 'company', id: 'co-getix', name: 'GetixHealth' })
  })

  test('shows the reason when the function refuses (rate limit), without a blank reply', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ status: 429, json: { error: 'Rate limit exceeded. Please try again later.' } })
    await openCopilot(page)
    await ask(page, 'Anything new?')
    await expect(page.getByText(/Rate limit exceeded/)).toBeVisible()
  })

  test('renders a reply as text, never as live HTML', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('See <img src=x onerror="window.__xss=1"> and https://evil.test/"onmouseover="window.__xss=1') })
    await openCopilot(page)
    await ask(page, 'Show me')
    await expect(page.getByText('See <img src=x')).toBeVisible()
    await page.getByRole('link', { name: /evil\.test/ }).hover()
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
  })
})

test.describe('saved conversations', () => {
  const saved = (backend: MockBackend) => {
    backend.tables.regway_ai_conversations.push(
      { id: 'conv-old', firm_id: FIRM_ID, user_id: USER.id, title: 'Form PF deadlines', context: null, updated_at: '2026-10-01T10:00:00Z' },
      { id: 'conv-new', firm_id: FIRM_ID, user_id: USER.id, title: 'Medicare rule for GetixHealth', context: { type: 'company', id: 'co-getix', name: 'GetixHealth' }, updated_at: '2026-10-03T10:00:00Z' },
    )
    backend.tables.regway_ai_messages.push(
      { conversation_id: 'conv-new', role: 'user', content: 'What does the Medicare rule change?', citations: null, created_at: '2026-10-03T09:59:00Z' },
      { conversation_id: 'conv-new', role: 'assistant', content: 'It updates outpatient payment rates.', citations: [], created_at: '2026-10-03T10:00:00Z' },
      { conversation_id: 'conv-old', role: 'user', content: 'When is Form PF due?', citations: null, created_at: '2026-10-01T10:00:00Z' },
    )
  }

  test('lists past conversations, most recent first, and says what each is about', async ({ page, backend }) => {
    saved(backend)
    await openCopilot(page)
    await page.getByRole('button', { name: 'History' }).click()

    await expect(page.getByText('Past conversations')).toBeVisible()
    await expect(page.locator('.truncate')).toHaveText(['Medicare rule for GetixHealth', 'Form PF deadlines'])
    await expect(page.getByText('· about GetixHealth')).toBeVisible()
  })

  test('resuming shows the earlier messages and continues the same conversation and scope', async ({ page, backend }) => {
    saved(backend)
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('From January 1.') })
    await openCopilot(page)
    await page.getByRole('button', { name: 'History' }).click()
    await page.getByRole('button', { name: /Medicare rule for GetixHealth/ }).click()

    await expect(page.getByText('What does the Medicare rule change?')).toBeVisible()
    await expect(page.getByText('It updates outpatient payment rates.')).toBeVisible()
    await expect(page.getByText('When is Form PF due?')).toHaveCount(0)
    await expect(page.getByText('Focused on GetixHealth')).toBeVisible()

    await ask(page, 'From when?')
    await expect(page.getByText('From January 1.')).toBeVisible()
    const [call] = chatCalls(backend)
    expect(call.conversationId).toBe('conv-new')
    expect(call.context).toMatchObject({ type: 'company', id: 'co-getix' })
  })

  test('deleting a conversation removes it', async ({ page, backend }) => {
    saved(backend)
    await openCopilot(page)
    await page.getByRole('button', { name: 'History' }).click()
    const row = page.locator('.group', { hasText: 'Form PF deadlines' })
    await row.hover()
    await row.getByRole('button', { name: 'Delete conversation' }).click()

    await expect(page.getByText('Form PF deadlines')).toHaveCount(0)
    await expect(page.getByText('Medicare rule for GetixHealth')).toBeVisible()
    expect(backend.called('DELETE', 'rest/v1/regway_ai_conversations')[0].query.get('id')).toBe('eq.conv-old')
  })

  test('says so when there are none', async ({ page }) => {
    await openCopilot(page)
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByText('No saved conversations yet.')).toBeVisible()
  })
})
