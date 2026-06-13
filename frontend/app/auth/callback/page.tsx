"use client"

import { Suspense, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { EdgeGlow } from "@/components/loading/edge-glow"
import { createClient } from "@/lib/supabase"
import { setSessionTokens } from "@/lib/session"
import { auth } from "@/lib/api"
import { signupEvents } from "@/lib/analytics"
import { getStoredReferral } from "@/lib/referral"
import {
  captureAttributionFromCallback,
  clearStoredAttribution,
  readStoredAttribution,
} from "@/lib/attribution"

/**
 * ADR-0006 §5 — single consumer for OAuth (`?code=`) AND magic-link
 * (`#access_token=`). On success we call POST /auth/post-signin so the
 * backend can:
 *   - preserve SH7 referral attribution on OAuth path
 *   - persist LinkedIn metadata + grant the one-time +50 XP
 *   - run the welcome XP grant via the BEFORE INSERT trigger
 *
 * Then we route to ?next= (whitelisted same-origin) or /home, except for
 * brand-new users who land on /onboarding (Day 1 first-run stepper:
 * cv → role → lens → companies → ninja → score). /welcome was merged into
 * the public landing (/), so first-run users go straight to the stepper.
 */

function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null
  return raw
}

function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handled = useRef(false)
  const routed = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    if (typeof window !== "undefined") captureAttributionFromCallback(window.location.href)
    type SbSession = NonNullable<
      Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]
    >
    const next = safeNext(searchParams.get("next"))
    const arrivedAt = Date.now()
    const isMagicLink = typeof window !== "undefined" && window.location.hash.includes("access_token")

    function routeOnce(dest: string) {
      if (routed.current) return
      routed.current = true
      router.replace(dest)
    }

    /**
     * Best-effort post-auth side effects. Fired AFTER the redirect, so it must
     * never block the user reaching the dashboard. `auth.postSignin` carries
     * `keepalive: true` (see lib/api.ts) so the navigation can't cancel it —
     * referral attribution (SH7) + LinkedIn XP survive the page unload. Profile
     * provisioning is backstopped server-side on the first authed request
     * (deps.py `_ensure_profile_provisioned`), so even total failure here only
     * risks a lost referral, never a broken account.
     */
    function backgroundPostSignin(session: SbSession, provider: string | null, firstSignup: string) {
      const user = session.user
      let linkedinVanity: string | null = null
      let linkedinHeadline: string | null = null
      let linkedinVerified: boolean | null = null
      if (user && ((provider ?? "") === "linkedin_oidc" || (provider ?? "") === "linkedin")) {
        const ident = (user.identities ?? []).find(
          (i) => i.provider === "linkedin_oidc" || i.provider === "linkedin",
        )
        const claims = (ident?.identity_data ?? {}) as Record<string, unknown>
        // Only write a real vanity URL. Standard OIDC `sub` for LinkedIn is
        // `urn:li:person:<id>` — NOT a vanity slug — so falling back would
        // persist a broken /in/<id> URL. Leave it empty; user sets it in Settings.
        if (typeof claims.vanityName === "string" && claims.vanityName.length > 0) {
          linkedinVanity = claims.vanityName
        }
        if (typeof claims.headline === "string") linkedinHeadline = claims.headline
        if (typeof claims.email_verified === "boolean") linkedinVerified = claims.email_verified as boolean
      }

      const method = provider === "google" ? "google" : provider?.startsWith("linkedin") ? "linkedin" : "magic_link"
      auth
        .postSignin(session.access_token, {
          provider,
          myro_ref: getStoredReferral(),
          attribution: readStoredAttribution(),
          is_new_signup: firstSignup === "1",
          linkedin_vanity: linkedinVanity,
          linkedin_headline: linkedinHeadline,
          linkedin_verified: linkedinVerified,
        })
        .then((result) => {
          clearStoredAttribution()
          signupEvents.oauthCallbackReturned({ success: "1", provider: provider ?? "magic_link" })
          signupEvents.completed({
            method,
            first_signup: firstSignup,
            ref_attributed: result.referral_attributed ? "1" : "0",
            surface: "callback",
          })
        })
        .catch(() => {
          signupEvents.oauthCallbackReturned({
            success: "0",
            provider: provider ?? "magic_link",
            error_code: "post_signin_failed",
          })
        })
      if (isMagicLink) {
        signupEvents.magicLinkConsumed({ latency_ms: Date.now() - arrivedAt })
      }
    }

    function finish(session: SbSession) {
      if (handled.current) return
      handled.current = true

      const provider =
        (session.user?.app_metadata?.provider as string | undefined) ??
        (session.user?.identities?.[0]?.provider as string | undefined) ??
        null

      setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })

      // Route the instant auth is in hand. `created_at` lives on the session
      // user already — no extra getUser() round-trip needed to tell a brand-new
      // signup from a returning login. Everything else is best-effort and runs
      // AFTER the redirect (backgroundPostSignin) so the user lands on the
      // dashboard skeleton in one round-trip instead of three.
      const createdAt = session.user?.created_at ?? null
      const firstSignup =
        createdAt && Math.abs(Date.now() - new Date(createdAt).getTime()) < 60_000 ? "1" : "0"
      routeOnce(next ?? (firstSignup === "1" ? "/onboarding" : "/home"))

      backgroundPostSignin(session, provider, firstSignup)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) finish(session)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(session)
    })

    // Safety net: no SIGNED_IN event AND getSession had no session → bounce to
    // /login. (The old "handled but not routed" net is gone — finish() now
    // routes synchronously the moment it flips `handled`, so the two can't drift.)
    const noSignInTimeout = setTimeout(() => {
      if (!handled.current && !routed.current) routeOnce("/login")
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(noSignInTimeout)
    }
  }, [router, searchParams])

  // Silent ambient field — no "Signing you in…" text. The redirect is now a
  // single round-trip, and the destination's own skeleton (app-shell →
  // DashboardSkeleton) is the real loading surface. A worded splash here would
  // only make the sub-second gap feel countable.
  return <EdgeGlow message="" />
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  )
}
