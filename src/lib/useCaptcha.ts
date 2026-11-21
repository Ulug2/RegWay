import { useCallback, useEffect, useRef } from 'react'
import { CAPTCHA_SITE_KEY, CaptchaError, createCaptcha, loadTurnstile, type Captcha } from './captcha'
import { getThemeChoice, resolveTheme } from './theme'

// The CAPTCHA for one form (see captcha.ts). Put `ref` on an empty element
// where Cloudflare may show its checkbox; call `getToken()` right before
// each Supabase auth call and pass the result as `captchaToken`. Without a
// site key it returns undefined and shows nothing.
export function useCaptcha() {
  const ref = useRef<HTMLDivElement>(null)
  const built = useRef<{ el: HTMLElement; captcha: Promise<Captcha> } | null>(null)

  // Each widget gets its own child element: Cloudflare refuses a second
  // widget in an element that held one (React mounts twice in development).
  const drop = (captcha: Promise<Captcha>) => void captcha.then(c => c.destroy(), () => {})

  // The widget for the element now in the page, built once (again if the
  // element was replaced, as when a tab is switched).
  const ensure = useCallback((): Promise<Captcha> => {
    const el = ref.current
    if (!CAPTCHA_SITE_KEY || !el) return Promise.reject(new CaptchaError())
    if (built.current?.el === el) return built.current.captcha
    if (built.current) drop(built.current.captcha)
    const siteKey = CAPTCHA_SITE_KEY
    const slot = document.createElement('div')
    el.appendChild(slot)
    const captcha = loadTurnstile().then(api => {
      const c = createCaptcha(api, slot, siteKey, resolveTheme(getThemeChoice()))
      return { token: c.token, destroy: () => { c.destroy(); slot.remove() } }
    })
    const entry = { el, captcha }
    built.current = entry
    // A failed load is tried again on the next call.
    captcha.catch(() => {
      slot.remove()
      if (built.current === entry) built.current = null
    })
    return captcha
  }, [])

  useEffect(() => {
    // Load early, so the first submit doesn't wait for Cloudflare's script.
    if (CAPTCHA_SITE_KEY && ref.current) ensure().catch(() => {})
    return () => {
      const b = built.current
      built.current = null
      if (b) drop(b.captcha)
    }
  }, [ensure])

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!CAPTCHA_SITE_KEY) return undefined
    return (await ensure()).token()
  }, [ensure])

  return { ref, getToken }
}
