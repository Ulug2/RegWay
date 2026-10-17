import type { Page } from '@playwright/test'
import { aiReply, expect, signIn, test, USER, FIRM_ID, type MockBackend } from './mockBackend'

const ASK = 'Ask RegWay AI about regulatory impact, compliance obligations, or fund exposure…'
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

    await page.getByRole('button', { name: 'Show chats' }).click()
    await page.getByRole('button', { name: 'New chat' }).click()
    await expect(page.getByText('Answer to: First question')).toHaveCount(0)
    await ask(page, 'Third question')
    await expect(page.getByText('Answer to: Third question')).toBeVisible()

    const [first, second, third] = chatCalls(backend)
    expect(second.conversationId).toBe(first.conversationId)
    expect(third.conversationId).toMatch(UUID)
    expect(third.conversationId).not.toBe(first.conversationId)
  })

  test('a suggested question sends, and the suggestions go once the chat has started', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = ({ message }) => ({ sse: aiReply(`Answer to: ${message}`) })
    await openCopilot(page)

    const suggestion = page.getByRole('button', { name: "Summarize today's changes" })
    await suggestion.click()
    await expect(page.getByText("Answer to: Summarize today's regulatory changes")).toBeVisible()
    await expect(suggestion).toHaveCount(0)
    expect(chatCalls(backend)[0].message).toBe("Summarize today's regulatory changes")
  })

  test('opens already focused on the company whose page is showing', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('The Medicare payment update.') })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'GetixHealth Healthcare' }).click()
    await page.getByPlaceholder('Ask RegWay AI about GetixHealth…').click()

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

test.describe('a chat with no answer is not kept', () => {
  // As the server does on a first message: the conversation exists before the answer.
  const starts = (backend: MockBackend, reply: { status?: number; json?: unknown; sse?: string; delay?: number }) => {
    backend.functions['regway-ai-chat'] = ({ conversationId, message }) => {
      backend.tables.regway_ai_conversations.push({ id: conversationId, firm_id: FIRM_ID, user_id: USER.id, title: message, context: null, updated_at: '2026-10-05T10:00:00Z' })
      return reply
    }
  }

  test('stopping the first answer removes the chat', async ({ page, backend }) => {
    starts(backend, { sse: aiReply('Too late.'), delay: 4000 })
    await openCopilot(page)
    await ask(page, 'A question I change my mind about')
    await page.getByTitle('Stop generating').click()

    await expect.poll(() => backend.tables.regway_ai_conversations.length).toBe(0)
    await page.getByRole('button', { name: 'Show chats' }).click()
    await expect(page.getByText('No saved conversations yet')).toBeVisible()
  })

  test('a first answer that fails removes the chat', async ({ page, backend }) => {
    starts(backend, { status: 500, json: { error: 'The AI provider is unavailable' } })
    await openCopilot(page)
    await ask(page, 'A question that fails')
    await expect(page.getByText(/Something went wrong/)).toBeVisible()
    await expect.poll(() => backend.tables.regway_ai_conversations.length).toBe(0)
  })

  test('stopping a later answer keeps the chat and what was saved', async ({ page, backend }) => {
    backend.tables.regway_ai_conversations.push({ id: 'conv-kept', firm_id: FIRM_ID, user_id: USER.id, title: 'Form PF deadlines', context: null, updated_at: '2026-10-01T10:00:00Z' })
    backend.tables.regway_ai_messages.push({ conversation_id: 'conv-kept', role: 'user', content: 'When is Form PF due?', citations: null, created_at: '2026-10-01T10:00:00Z' })
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('Too late.'), delay: 4000 })
    await openCopilot(page)
    await page.getByRole('button', { name: 'Show chats' }).click()
    await page.getByRole('button', { name: /Form PF deadlines/ }).click()
    await ask(page, 'And the next one?')
    await page.getByTitle('Stop generating').click()

    await expect(page.getByTitle('Send')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(backend.tables.regway_ai_conversations.map(c => c.id)).toEqual(['conv-kept'])
    // Stamped for the server, which doesn't see the closed connection.
    expect(backend.tables.regway_ai_conversations[0].stopped_at).toEqual(expect.any(String))
  })
})

test.describe('closing the chat while an answer is being written', () => {
  test('the answer carries on, and reopening the chat returns to it', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('A late answer.'), delay: 2500 })
    await openCopilot(page)
    await ask(page, 'A slow question')
    await page.getByRole('button', { name: 'Close RegWay AI' }).click()
    await expect(page.getByText('RegWay AI Copilot')).toBeHidden()

    await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
    await expect(page.getByText('A slow question')).toBeVisible()
    await expect(page.getByText('A late answer.')).toBeVisible()
    // One request: the answer was not asked for again.
    expect(chatCalls(backend)).toHaveLength(1)
  })

  test('once the answer has finished out of sight, the chat opens fresh and the request was not cut short', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('A late answer.'), delay: 1500 })
    await openCopilot(page)
    await ask(page, 'A slow question')
    await page.getByRole('button', { name: 'Close RegWay AI' }).click()
    await expect(page.locator('[aria-label="Message RegWay AI"]')).toHaveCount(0, { timeout: 15000 })

    await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
    await expect(page.getByText('RegWay AI Copilot')).toBeVisible()
    await expect(page.getByText('A slow question')).toHaveCount(0)
  })
})

test.describe('suggested questions', () => {
  test('are about the company the chat is focused on', async ({ page }) => {
    await openCopilot(page)
    await expect(page.getByRole('button', { name: 'What fund deadlines are coming up?' })).toBeVisible()
    await page.getByRole('complementary', { name: 'Session context' }).getByRole('button', { name: /GetixHealth/ }).click()
    await expect(page.getByTitle('What deadlines are coming up for GetixHealth?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'What fund deadlines are coming up?' })).toHaveCount(0)
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
    await page.getByRole('button', { name: 'Show chats' }).click()

    await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Chats' }).locator('.text-sm')).toHaveText(['Medicare rule for GetixHealth', 'Form PF deadlines'])
    await expect(page.getByText('· about GetixHealth')).toBeVisible()
  })

  test('search narrows the list, and conversations are grouped by when they were last used', async ({ page, backend }) => {
    saved(backend)
    await openCopilot(page)
    await page.getByRole('button', { name: 'Show chats' }).click()
    const chats = page.getByRole('complementary', { name: 'Chats' })
    await expect(chats.getByRole('heading', { level: 3 }).first()).toHaveText(/Today|Yesterday|Previous 7 days|Older/)

    await chats.getByRole('searchbox', { name: 'Search conversations' }).fill('form pf')
    await expect(chats.locator('.text-sm')).toHaveText(['Form PF deadlines'])
    await chats.getByRole('searchbox', { name: 'Search conversations' }).fill('zzz')
    await expect(chats.getByText('No conversation matches “zzz”.')).toBeVisible()
  })

  test('resuming shows the earlier messages and continues the same conversation and scope', async ({ page, backend }) => {
    saved(backend)
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('From January 1.') })
    await openCopilot(page)
    await page.getByRole('button', { name: 'Show chats' }).click()
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
    await page.getByRole('button', { name: 'Show chats' }).click()
    const row = page.locator('.group', { hasText: 'Form PF deadlines' })
    await row.hover()
    await row.getByRole('button', { name: 'Delete conversation' }).click()

    await expect(page.getByText('Form PF deadlines')).toHaveCount(0)
    await expect(page.getByText('Medicare rule for GetixHealth')).toBeVisible()
    expect(backend.called('DELETE', 'rest/v1/regway_ai_conversations')[0].query.get('id')).toBe('eq.conv-old')
  })

  test('says so when there are none', async ({ page }) => {
    await openCopilot(page)
    await page.getByRole('button', { name: 'Show chats' }).click()
    await expect(page.getByText('No saved conversations yet.')).toBeVisible()
  })
})

test.describe('chat sidebar and session context', () => {
  const context = (page: Page) => page.getByRole('complementary', { name: 'Session context' })

  test('a new conversation appears in the chats list once its first message is answered', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = ({ conversationId }) => {
      backend.tables.regway_ai_conversations.push({ id: conversationId, firm_id: FIRM_ID, user_id: USER.id, title: 'Brand new question', context: null, updated_at: new Date().toISOString() })
      return { sse: aiReply('An answer.') }
    }
    await openCopilot(page)
    await page.getByRole('button', { name: 'Show chats' }).click()
    await expect(page.getByText('No saved conversations yet.')).toBeVisible()
    await ask(page, 'Brand new question')
    await expect(page.getByText('An answer.')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Chats' }).getByText('Brand new question')).toBeVisible()
  })

  test('picking a company before the first message starts the chat focused on it', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('About GetixHealth.') })
    await openCopilot(page)
    await context(page).getByRole('button', { name: 'GetixHealth' }).click()
    await expect(page.getByText('Focused on GetixHealth')).toBeVisible()
    await expect(page.getByText("Ask me anything about GetixHealth's regulatory exposure")).toBeVisible()

    await ask(page, 'What applies?')
    await expect(page.getByText('About GetixHealth.')).toBeVisible()
    const [call] = chatCalls(backend)
    expect(call.context).toMatchObject({ type: 'company', id: 'co-getix', name: 'GetixHealth' })
    expect(call.refocus).toBeUndefined()
  })

  test('switching focus mid-chat sends the switch once, with the next message', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = ({ message }) => ({ sse: aiReply(`Answer to: ${message}`) })
    await openCopilot(page)
    await ask(page, 'Firm question')
    await expect(page.getByText('Answer to: Firm question')).toBeVisible()

    await context(page).getByRole('button', { name: /Harbor Fund II/ }).click()
    await expect(page.getByText('Focused on Harbor Fund II')).toBeVisible()
    await expect(page.getByText('Focus switched to Harbor Fund II')).toBeVisible()
    await ask(page, 'Fund question')
    await expect(page.getByText('Answer to: Fund question')).toBeVisible()
    await expect(page.getByText('Focus switched to Harbor Fund II')).toHaveCount(0)

    await context(page).getByRole('button', { name: /Harbor Capital \(whole firm\)/ }).click()
    await ask(page, 'Back to the firm')
    await expect(page.getByText('Answer to: Back to the firm')).toBeVisible()

    const [first, second, third] = chatCalls(backend)
    expect(first.refocus).toBeUndefined()
    expect(second.refocus).toEqual({ type: 'fund', id: 'fund-2', name: 'Harbor Fund II' })
    expect(second.conversationId).toBe(first.conversationId)
    expect(third.refocus).toEqual({ type: 'firm' })
  })

  test('the session context panel closes and reopens, and lists attached files', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('Read it.') })
    await openCopilot(page)
    await expect(context(page).getByText('None attached')).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles({ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('A short memo.') })
    await expect(context(page).getByText('memo.txt (not sent yet)')).toBeVisible()
    await ask(page, 'Summarise')
    await expect(page.getByText('Read it.')).toBeVisible()
    await expect(context(page).getByText('memo.txt', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Close session context' }).click()
    await expect(context(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Session context' }).click()
    await expect(context(page)).toBeVisible()
  })
})


// The check run after an answer that claims something applies to the firm
// (regway-ai-chat/review.ts), as the server adds it to the stream.
const regwayEvents = (...events: Record<string, unknown>[]) => events.map(e => `event: regway\ndata: ${JSON.stringify(e)}\n\n`).join('')
const step = (name: 'facts' | 'sources', state: 'running' | 'done' | 'failed', label: string) => ({ type: 'regway_status', step: name, state, label })
const CAUTION = {
  type: 'regway_review',
  review: {
    status: 'caution',
    checks: ['facts', 'sources'],
    claims: 1,
    notes: [{ claim: 'The CLIA rule applies to GetixHealth.', note: 'Running a clinical laboratory is not recorded for GetixHealth.' }],
  },
}

test.describe('the check after an answer about the firm', () => {
  test('shows each step while it runs', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({
      sse: aiReply('Yes, the CLIA rule applies to GetixHealth.') + regwayEvents(step('facts', 'running', 'Checking against your recorded facts…'), step('sources', 'running', 'Verifying sources…')),
    })
    await openCopilot(page)
    await ask(page, 'Does the CLIA rule affect GetixHealth?')
    await expect(page.getByText('Yes, the CLIA rule applies to GetixHealth.')).toBeVisible()
    await expect(page.getByText('Checking against your recorded facts…')).toBeVisible()
    await expect(page.getByText('Verifying sources…')).toBeVisible()
  })

  test('ends in a note that says what to confirm, in place of the steps', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({
      sse:
        aiReply('Yes, the CLIA rule applies to GetixHealth.', [{ url: 'https://www.cms.gov/clia', title: 'CLIA proposed rule' }]) +
        regwayEvents(
          step('facts', 'running', 'Checking against your recorded facts…'),
          step('sources', 'running', 'Verifying sources…'),
          step('sources', 'done', 'Verified sources'),
          step('facts', 'done', 'Checked against your recorded facts'),
          CAUTION,
        ),
    })
    await openCopilot(page)
    await ask(page, 'Does the CLIA rule affect GetixHealth?')
    const note = page.getByRole('status').filter({ hasText: 'worth confirming' })
    await expect(note).toContainText('Checked against your recorded facts and the cited sources')
    await expect(note).toContainText('Running a clinical laboratory is not recorded for GetixHealth.')
    await expect(page.getByText('Checking against your recorded facts…')).toHaveCount(0)
  })

  test('an answer with no claim about the firm shows nothing extra', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('CLIA sets quality standards for laboratory testing.') })
    await openCopilot(page)
    await ask(page, 'What is CLIA?')
    await expect(page.getByText('CLIA sets quality standards for laboratory testing.')).toBeVisible()
    await expect(page.getByText(/Checked against/)).toHaveCount(0)
  })

  test('a reopened conversation shows the note saved with the answer', async ({ page, backend }) => {
    backend.tables.regway_ai_conversations.push({ id: 'conv-checked', firm_id: FIRM_ID, user_id: USER.id, title: 'CLIA and GetixHealth', context: null, updated_at: '2026-10-03T10:00:00Z' })
    backend.tables.regway_ai_messages.push(
      { conversation_id: 'conv-checked', role: 'user', content: 'Does the CLIA rule affect GetixHealth?', citations: null, review: null, created_at: '2026-10-03T09:59:00Z' },
      { conversation_id: 'conv-checked', role: 'assistant', content: 'It may, if GetixHealth runs a laboratory.', citations: [], review: { status: 'supported', checks: ['facts'], claims: 1, notes: [] }, created_at: '2026-10-03T10:00:00Z' },
    )
    await openCopilot(page)
    await page.getByRole('button', { name: 'Show chats' }).click()
    await page.getByRole('button', { name: /CLIA and GetixHealth/ }).click()
    await expect(page.getByText('Checked against your recorded facts: supported.')).toBeVisible()
  })

  test.describe('at phone width', () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test('the note fits the screen', async ({ page, backend }) => {
      backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('Yes, it applies to GetixHealth.') + regwayEvents(CAUTION) })
      await openCopilot(page)
      await ask(page, 'Does it affect GetixHealth?')
      const note = page.getByRole('status').filter({ hasText: 'worth confirming' })
      await expect(note).toBeVisible()
      const box = await note.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    })
  })
})
