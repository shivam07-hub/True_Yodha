type GTag = (command: string, eventName: string, params?: Record<string, unknown>) => void

declare global {
  interface Window { gtag?: GTag }
}

export function trackEvent(name: string, props?: Record<string, string | number>): void {
  if (typeof window === "undefined") return
  if (typeof window.gtag === "function") {
    window.gtag("event", name, props)
  }
}

// ── ADR-0006 frictionless signup telemetry ────────────────────────────────
// 12 GA4 events total. method enum: google | linkedin | magic_link | password.

export type SignupMethod = "google" | "linkedin" | "magic_link" | "password"
export type CVInputSource = "pdf_upload" | "text_describe" | "linkedin_pdf"

/** Cohort-segment hash of email domain (PV1 — never store the address). */
export function hashEmailDomain(email: string): string {
  const domain = email.toLowerCase().split("@")[1] ?? ""
  let h = 5381
  for (let i = 0; i < domain.length; i++) h = ((h << 5) + h + domain.charCodeAt(i)) & 0xffffffff
  return (h >>> 0).toString(16).slice(0, 8)
}

export const signupEvents = {
  modalShown(props: { surface: string; in_app_browser?: string; has_ref?: string }) {
    trackEvent("signup_modal_shown", props)
  },
  methodTapped(props: { method: SignupMethod; surface: string }) {
    trackEvent("signup_method_tapped", props)
  },
  oauthRedirectStarted(props: { provider: "google" | "linkedin" }) {
    trackEvent("signup_oauth_redirect_started", props)
  },
  oauthCallbackReturned(props: { success: string; error_code?: string; provider?: string }) {
    trackEvent("signup_oauth_callback_returned", props)
  },
  magicLinkSent(props: { email_domain_hash: string }) {
    trackEvent("signup_magic_link_sent", props)
  },
  magicLinkConsumed(props: { latency_ms: number }) {
    trackEvent("signup_magic_link_consumed", props)
  },
  completed(props: { method: SignupMethod; first_signup: string; ref_attributed: string; surface: string }) {
    trackEvent("signup_completed", props)
  },
  failed(props: { method: SignupMethod; stage: string; error_code: string }) {
    trackEvent("signup_failed", props)
  },
  modalDismissed(props: { surface: string; method_seen_count: number; time_open_ms: number }) {
    trackEvent("signup_modal_dismissed", props)
  },
  inAppBrowserWarningShown(props: { agent: string }) {
    trackEvent("signup_in_app_browser_warning_shown", props)
  },
  linkedinDisclosureExpanded(props: { surface: string }) {
    trackEvent("signup_linkedin_disclosure_expanded", props)
  },
  cvInputSourceSelected(props: { source: CVInputSource }) {
    trackEvent("cv_input_source_selected", props)
  },
}
