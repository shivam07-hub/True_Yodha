/**
 * Cloudflare Turnstile gate for the pre-login anon endpoints (score-cv,
 * rewrite-bullet, restructure). The backend (`_verify_turnstile`) is
 * fail-closed once `TURNSTILE_SECRET` is set: a tokenless request 403s. So
 * every anon call must carry a fresh token.
 *
 * This is a framework-agnostic singleton, called from inside the `publicCv`
 * API methods themselves (one choke point, where `cf_turnstile_token` is
 * already attached) so no component has to thread a token down. It lazily
 * injects the Turnstile script + a hidden body-level container, renders an
 * execute-on-demand widget (`execution: "execute"` + `appearance:
 * "interaction-only"` → invisible unless Cloudflare flags the request), and
 * resolves a token on demand.
 *
 * Key pairing (CLAUDE.md #30 / #17 Razorpay note): the site key here and the
 * backend secret must be flipped together on prod. The default below is
 * Cloudflare's always-pass TEST key, which only validates against the test
 * SECRET — so on dev (no secret → backend skips) it's a no-op, and on prod the
 * real `NEXT_PUBLIC_TURNSTILE_SITE_KEY` must be set in lockstep with the real
 * backend secret, or every anon request fails verification.
 *
 * Degrades to `null` on any failure (script blocked, timeout, SSR). Callers
 * pass that straight through; the backend only rejects null once a secret
 * exists, so dev and pre-provision prod stay rate-limit-only.
 */

// Cloudflare's documented always-pass test site key (dev default).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js"
const TOKEN_TIMEOUT_MS = 8000

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  execute: (id: string) => void
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null
let widgetPromise: Promise<string | null> | null = null
let pending: ((token: string | null) => void) | null = null

function settle(token: string | null) {
  const resolve = pending
  pending = null
  resolve?.(token)
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("turnstile_script_failed")))
      return
    }
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("turnstile_script_failed"))
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Lazily render the execute-on-demand widget once; resolves its id (or null). */
function ensureWidget(): Promise<string | null> {
  if (widgetPromise) return widgetPromise
  widgetPromise = loadScript()
    .then(() => {
      if (typeof window === "undefined" || !window.turnstile) return null
      const container = document.createElement("div")
      container.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;left:-9999px"
      container.setAttribute("aria-hidden", "true")
      document.body.appendChild(container)
      return window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (token: string) => settle(token),
        "error-callback": () => settle(null),
        "timeout-callback": () => settle(null),
      })
    })
    .catch(() => null)
  return widgetPromise
}

/**
 * Resolve a fresh Turnstile token for one anon request, or `null` if the widget
 * can't run. Safe to call repeatedly; each call resets + re-executes the widget.
 */
export async function getTurnstileToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  const id = await ensureWidget()
  if (!id || !window.turnstile) return null
  return new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => settle(null), TOKEN_TIMEOUT_MS)
    pending = (token) => {
      window.clearTimeout(timer)
      resolve(token)
    }
    try {
      window.turnstile!.reset(id)
      window.turnstile!.execute(id)
    } catch {
      settle(null)
    }
  })
}
