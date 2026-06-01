/**
 * Single source of truth for loading + failure user-facing copy.
 *
 * Every loading/error surface (route fallbacks, section tiles, the dashboard
 * gate, the crash boundary) reads its strings from here so the voice stays
 * consistent and a wording change is one edit, not twelve.
 *
 * Voice: honest, blameless on our-fault (5xx), no dark patterns. A 5xx says
 * "not you" out loud; a timeout says "not your connection"; an expired session
 * reassures that progress is saved. See /ux-copy session 2026-05-30.
 */

/** What kind of failure the UI is rendering. Derived from ApiError, never raw. */
export type FailureKind =
  | "offline"
  | "timeout"
  | "server" // 5xx — our fault
  | "session" // 401
  | "forbidden" // 403
  | "notFound" // 404
  | "rateLimited" // 429
  | "sectionFailed" // one region failed, rest of page is fine
  | "stale" // showing cached data because refresh failed
  | "crash" // render-time exception (error boundary)

export type FailureActionKind = "retry" | "login" | "home" | "refresh" | "reload"

export interface FailureCopy {
  /** Full message for a roomy surface (full-area fallback). May be two sentences. */
  title: string
  /** Compact message for a tight tile. */
  short: string
  /** The single right next step, or null when the recovery is automatic. */
  action: { label: string; kind: FailureActionKind } | null
}

/**
 * `{age}` in `stale.title`/`stale.short` is a placeholder — format the relative
 * time with Intl at the call site and interpolate; never concatenate raw.
 */
export const FAILURE_COPY: Record<FailureKind, FailureCopy> = {
  offline: {
    title: "You're offline. Check your connection and we'll pick up where you left off.",
    short: "You're offline.",
    action: { label: "Retry", kind: "retry" },
  },
  timeout: {
    title: "Our servers are running slow right now. Not your connection — give it another go.",
    short: "Servers are slow.",
    action: { label: "Retry", kind: "retry" },
  },
  server: {
    title: "Something broke on our end — not you. We've been alerted and we're on it.",
    short: "Our mistake. We're on it.",
    action: { label: "Retry", kind: "retry" },
  },
  session: {
    title: "Your session expired. Sign back in — your progress is saved.",
    short: "Session expired.",
    action: { label: "Sign in", kind: "login" },
  },
  forbidden: {
    title: "You don't have access to this. If that's a surprise, reach out to support.",
    short: "No access.",
    action: { label: "Back to home", kind: "home" },
  },
  notFound: {
    title: "We couldn't find that. It may have moved or been removed.",
    short: "Not found.",
    action: { label: "Back to home", kind: "home" },
  },
  rateLimited: {
    title: "Too many requests in a short window. Give it a moment and try again.",
    short: "Too many requests.",
    action: { label: "Retry", kind: "retry" },
  },
  sectionFailed: {
    title: "Couldn't load this. The rest of your dashboard is fine.",
    short: "Couldn't load.",
    action: { label: "Retry", kind: "retry" },
  },
  stale: {
    title: "Showing your last view from {age}. Couldn't refresh just now.",
    short: "Last updated {age}.",
    action: { label: "Refresh", kind: "refresh" },
  },
  crash: {
    title: "This screen hit a snag. Reloading usually clears it.",
    short: "This screen hit a snag.",
    action: { label: "Reload", kind: "reload" },
  },
}

/** Append next to any 5xx surface so support can trace the exact request. */
export function traceRefLine(traceId: string | null | undefined): string | null {
  if (!traceId) return null
  return `Error ref: ${traceId}`
}
