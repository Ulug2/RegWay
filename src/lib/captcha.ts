// CAPTCHA on sign-up, sign-in and password reset (security audit, 16g).
//
// Supabase checks a Cloudflare Turnstile token on those calls once CAPTCHA
// protection is switched on in its dashboard. The widget stays invisible
// unless Cloudflare wants the visitor to tick a box. A token is good for one
// call, so `token()` asks for a fresh one each time (the profile page's
// password change makes two calls in a row).
//
// No site key (a local database, tests): no widget, no token, and Supabase
// does not ask for one. The site key is public; the secret key lives only in
// the Supabase dashboard.

export const CAPTCHA_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
// Long enough for a visitor to answer a challenge.
const TOKEN_TIMEOUT_MS = 60_000

export const CAPTCHA_FAILED_MESSAGE = "We couldn't confirm you're a person. Please try again."

// The parts of Cloudflare's `window.turnstile` used here.
export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined
  execute(widgetId: string): void
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export class CaptchaError extends Error {
  constructor() {
    super(CAPTCHA_FAILED_MESSAGE)
    this.name = 'CaptchaError'
  }
}

let loading: Promise<TurnstileApi> | null = null

// Cloudflare's script, added to the page once, on first use.
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new CaptchaError()))
      script.onerror = () => {
        loading = null
        script.remove()
        reject(new CaptchaError())
      }
      document.head.appendChild(script)
    }).catch(err => {
      loading = null
      throw err
    })
  }
  return loading
}

export interface Captcha {
  // A fresh token for one Supabase call; rejects with CaptchaError.
  token(): Promise<string>
  destroy(): void
}

export function createCaptcha(
  api: TurnstileApi,
  container: HTMLElement,
  siteKey: string,
  theme: 'light' | 'dark',
  timeoutMs = TOKEN_TIMEOUT_MS,
): Captcha {
  let pending: { resolve: (t: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null
  const settle = (token: string | null) => {
    if (!pending) return
    const p = pending
    pending = null
    clearTimeout(p.timer)
    if (token) p.resolve(token)
    else p.reject(new CaptchaError())
  }

  // Cloudflare's API throws on misuse; every failure reads the same to the
  // visitor.
  const attempt = <T,>(fn: () => T): T | undefined => {
    try {
      return fn()
    } catch {
      return undefined
    }
  }

  const widgetId = attempt(() => api.render(container, {
    sitekey: siteKey,
    theme,
    // Run only when asked, and show nothing unless the visitor must act.
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => settle(token),
    'error-callback': () => {
      settle(null)
      // Handled: stops Turnstile retrying on its own.
      return true
    },
    'expired-callback': () => settle(null),
    'timeout-callback': () => settle(null),
  }))

  return {
    token() {
      if (!widgetId) return Promise.reject(new CaptchaError())
      settle(null)
      return new Promise<string>((resolve, reject) => {
        pending = { resolve, reject, timer: setTimeout(() => settle(null), timeoutMs) }
        attempt(() => api.reset(widgetId))
        if (attempt(() => (api.execute(widgetId), true)) !== true) settle(null)
      })
    },
    destroy() {
      settle(null)
      if (widgetId) attempt(() => api.remove(widgetId))
    },
  }
}
