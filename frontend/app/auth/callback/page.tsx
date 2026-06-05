"use client"

import { Suspense, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { EdgeGlow } from "@/components/loading/edge-glow"
import { createClient } from "@/lib/supabase"
import { setSessionTokens } from "@/lib/session"
import { auth } from "@/lib/api"
import { signupEvents } from "@/lib/analytics"
import { getStoredReferral } from "@/lib/referral"

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

/**
 * Wrap a promise with a hard timeout. Resolves with `fallback` when the
 * underlying promise doesn't settle before `ms`. Prevents an SDK call that
 * silently hangs (network glitch / WebSocket retry / extension blocking)
 * from freezing the entire callback flow.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const t = setTimeout(() => { if (!settled) { settled = true; resolve(fallback) } }, ms)
    p.then((v) => { if (!settled) { settled = true; clearTimeout(t); resolve(v) } })
     .catch(() => { if (!settled) { settled = true; clearTimeout(t); resolve(fallback) } })
  })
}

function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handled = useRef(false)
  const routed = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const next = safeNext(searchParams.get("next"))
    const arrivedAt = Date.now()
    const isMagicLink = typeof window !== "undefined" && window.location.hash.includes("access_token")

    function routeOnce(dest: string) {
      if (routed.current) return
      routed.current = true
      router.replace(dest)
    }

    async function finish(session: { access_token: string; refresh_token: string }, provider: string | null) {
      if (handled.current) return
      handled.current = true

      setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })

      // Best-effort identity read — bounded so a hung getUser() can't freeze
      // the flow. Defaults preserve null/null so post-signin still fires.
      let linkedinVanity: string | null = null
      let linkedinHeadline: string | null = null
      let linkedinVerified: boolean | null = null
      let createdAt: string | null = null
      type UserRead = { user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null }
      const userRead = await withTimeout<UserRead>(
        supabase.auth.getUser().then((r) => ({ user: r.data?.user ?? null })),
        3500,
        { user: null },
      )
      const user = userRead.user
      createdAt = user?.created_at ?? null
      if (user && ((provider ?? "") === "linkedin_oidc" || (provider ?? "") === "linkedin")) {
        const ident = (user.identities ?? []).find(
          (i) => i.provider === "linkedin_oidc" || i.provider === "linkedin",
        )
        const claims = (ident?.identity_data ?? {}) as Record<string, unknown>
        // Only write a real vanity URL. Standard OIDC `sub` for LinkedIn is
        // `urn:li:person:<id>` — that's NOT a vanity slug, so falling back
        // would persist a broken /in/<id> URL. Better to leave it empty and
        // let the user set it later via Settings.
        if (typeof claims.vanityName === "string" && claims.vanityName.length > 0) {
          linkedinVanity = claims.vanityName
        }
        if (typeof claims.headline === "string") linkedinHeadline = claims.headline
        if (typeof claims.email_verified === "boolean") linkedinVerified = claims.email_verified as boolean
      }

      const refSlug = getStoredReferral()
      const result = await withTimeout(
        auth.postSignin(session.access_token, {
          provider,
          myro_ref: refSlug,
          linkedin_vanity: linkedinVanity,
          linkedin_headline: linkedinHeadline,
          linkedin_verified: linkedinVerified,
        }),
        5000,
        null,
      )

      const method = provider === "google" ? "google" : provider?.startsWith("linkedin") ? "linkedin" : "magic_link"
      const firstSignup = createdAt && Math.abs(Date.now() - new Date(createdAt).getTime()) < 60_000 ? "1" : "0"
      if (result) {
        signupEvents.oauthCallbackReturned({ success: "1", provider: provider ?? "magic_link" })
        signupEvents.completed({
          method,
          first_signup: firstSignup,
          ref_attributed: result.referral_attributed ? "1" : "0",
          surface: "callback",
        })
      } else {
        signupEvents.oauthCallbackReturned({
          success: "0",
          provider: provider ?? "magic_link",
          error_code: "post_signin_timeout_or_error",
        })
      }
      if (isMagicLink) {
        signupEvents.magicLinkConsumed({ latency_ms: Date.now() - arrivedAt })
      }
      routeOnce(next ?? (firstSignup === "1" ? "/onboarding" : "/home"))
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        const provider =
          (session.user?.app_metadata?.provider as string | undefined) ??
          (session.user?.identities?.[0]?.provider as string | undefined) ??
          null
        await finish({ access_token: session.access_token, refresh_token: session.refresh_token }, provider)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const provider =
          (session.user?.app_metadata?.provider as string | undefined) ??
          (session.user?.identities?.[0]?.provider as string | undefined) ??
          null
        finish({ access_token: session.access_token, refresh_token: session.refresh_token }, provider)
      }
    })

    // Two safety nets:
    //   1. handled never flips    → no SIGNED_IN event arrived       → /login
    //   2. handled flipped but routed didn't fire after 10s total    → /home
    //      (auth succeeded but a downstream await stalled — user is
    //      authenticated, send them to the app instead of /login).
    const noSignInTimeout = setTimeout(() => {
      if (!handled.current && !routed.current) routeOnce("/login")
    }, 6000)
    const stuckRouteTimeout = setTimeout(() => {
      if (handled.current && !routed.current) routeOnce(next ?? "/home")
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(noSignInTimeout)
      clearTimeout(stuckRouteTimeout)
    }
  }, [router, searchParams])

  return <EdgeGlow message="Signing you in…" />
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  )
}
