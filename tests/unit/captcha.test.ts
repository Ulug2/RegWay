import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPTCHA_FAILED_MESSAGE, CAPTCHA_SITE_KEY, CaptchaError, createCaptcha, type TurnstileApi } from '../../src/lib/captcha'
import { passwordErrorMessage } from '../../src/lib/password'

// A stand-in for Cloudflare's `window.turnstile`: records calls and lets the
// test play Cloudflare's part through the callbacks it was given.
// `null`: Cloudflare could not draw the widget.
function fakeTurnstile(widgetId: string | null = 'w1') {
  let options: Record<string, (...args: unknown[]) => unknown> = {}
  const api = {
    render: vi.fn((_el: HTMLElement, opts: Record<string, unknown>) => {
      options = opts as typeof options
      return widgetId ?? undefined
    }),
    execute: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn(),
  } satisfies TurnstileApi
  return {
    api,
    options: () => options,
    solve: (token: string) => options.callback(token),
    fail: () => options['error-callback'](),
    expire: () => options['expired-callback'](),
  }
}

const el = {} as HTMLElement

afterEach(() => vi.useRealTimers())

describe('captcha', () => {
  it('is off without a site key (local and tests)', () => {
    expect(CAPTCHA_SITE_KEY).toBeUndefined()
  })

  it('renders an invisible widget that runs only when asked', () => {
    const t = fakeTurnstile()
    createCaptcha(t.api, el, 'site-key', 'dark')
    expect(t.api.render).toHaveBeenCalledTimes(1)
    expect(t.options()).toMatchObject({ sitekey: 'site-key', theme: 'dark', execution: 'execute', appearance: 'interaction-only' })
    expect(t.api.execute).not.toHaveBeenCalled()
  })

  it('gets a fresh token for every call', async () => {
    const t = fakeTurnstile()
    const c = createCaptcha(t.api, el, 'site-key', 'light')

    const first = c.token()
    expect(t.api.reset).toHaveBeenCalledWith('w1')
    expect(t.api.execute).toHaveBeenCalledWith('w1')
    t.solve('token-1')
    await expect(first).resolves.toBe('token-1')

    // The profile page's password change: check, then reset email.
    const second = c.token()
    expect(t.api.reset).toHaveBeenCalledTimes(2)
    expect(t.api.execute).toHaveBeenCalledTimes(2)
    t.solve('token-2')
    await expect(second).resolves.toBe('token-2')
  })

  it('refuses when Cloudflare reports an error, and stops it retrying', async () => {
    const t = fakeTurnstile()
    const c = createCaptcha(t.api, el, 'site-key', 'light')
    const p = c.token()
    expect(t.fail()).toBe(true)
    await expect(p).rejects.toBeInstanceOf(CaptchaError)
    await expect(p).rejects.toThrow(CAPTCHA_FAILED_MESSAGE)
  })

  it('refuses an expired challenge', async () => {
    const t = fakeTurnstile()
    const p = createCaptcha(t.api, el, 'site-key', 'light').token()
    t.expire()
    await expect(p).rejects.toBeInstanceOf(CaptchaError)
  })

  it('gives up when no token comes in time', async () => {
    vi.useFakeTimers()
    const t = fakeTurnstile()
    const p = createCaptcha(t.api, el, 'site-key', 'light', 1000).token()
    const check = expect(p).rejects.toBeInstanceOf(CaptchaError)
    vi.advanceTimersByTime(1000)
    await check
  })

  it('refuses when the widget could not be drawn', async () => {
    const t = fakeTurnstile(null)
    await expect(createCaptcha(t.api, el, 'site-key', 'light').token()).rejects.toBeInstanceOf(CaptchaError)
    expect(t.api.execute).not.toHaveBeenCalled()
  })

  it("turns Cloudflare's own errors into the plain message", async () => {
    const t = fakeTurnstile()
    t.api.execute.mockImplementation(() => {
      throw new Error('[Cloudflare Turnstile] Nothing to reset found for provided container.')
    })
    const p = createCaptcha(t.api, el, 'site-key', 'light').token()
    await expect(p).rejects.toThrow(CAPTCHA_FAILED_MESSAGE)

    const broken = fakeTurnstile()
    broken.api.render.mockImplementation(() => {
      throw new Error('[Cloudflare Turnstile] Invalid sitekey')
    })
    await expect(createCaptcha(broken.api, el, 'bad', 'light').token()).rejects.toBeInstanceOf(CaptchaError)
  })

  it('removes the widget and ends a waiting call when the form closes', async () => {
    const t = fakeTurnstile()
    const c = createCaptcha(t.api, el, 'site-key', 'light')
    const p = c.token()
    c.destroy()
    expect(t.api.remove).toHaveBeenCalledWith('w1')
    await expect(p).rejects.toBeInstanceOf(CaptchaError)
  })

  it("explains Supabase's refusal in plain words", () => {
    expect(passwordErrorMessage({ code: 'captcha_failed', message: 'captcha protection: request disallowed' }, 'x')).toBe(CAPTCHA_FAILED_MESSAGE)
  })
})
