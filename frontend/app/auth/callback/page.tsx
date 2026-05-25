"use client"

import { Suspense, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
 * brand-new users who land on /onboarding.
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

  useEffect(() => {
    const supabase = createClient()
    const next = safeNext(searchParams.get("next"))
    const arrivedAt = Date.now()
    const isMagicLink = typeof window !== "undefined" && window.location.hash.includes("access_token")

    async function finish(session: { access_token: string; refresh_token: string }, provider: string | null) {
      if (handled.current) return
      handled.current = true

      setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })

      // Extract LinkedIn identity claims from the provider's ID token. Supabase
      // surfaces these on `user.identities[].identity_data` for OAuth signins.
      let linkedinVanity: string | null = null
      let linkedinHeadline: string | null = null
      let linkedinVerified: boolean | null = null
      let createdAt: string | null = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        createdAt = user?.created_at ?? null
        if ((provider ?? "") === "linkedin_oidc" || (provider ?? "") === "linkedin") {
          const ident = (user?.identities ?? []).find(
            (i) => i.provider === "linkedin_oidc" || i.provider === "linkedin",
          )
          const claims = (ident?.identity_data ?? {}) as Record<string, unknown>
          linkedinVanity = (claims.vanityName as string | undefined) ?? null
          if (!linkedinVanity && typeof claims.sub === "string") {
            // OIDC `sub` doubles as the stable LinkedIn person URN — fall back.
            linkedinVanity = String(claims.sub).split(":").pop() ?? null
          }
          linkedinHeadline = (claims.headline as string | undefined) ?? null
          if (typeof claims.email_verified === "boolean") {
            linkedinVerified = claims.email_verified as boolean
          }
        }
      } catch {
        // identity read is best-effort; post-signin still fires
      }

      const refSlug = getStoredReferral()
      try {
        const result = await auth.postSignin(session.access_token, {
          provider,
          myro_ref: refSlug,
          linkedin_vanity: linkedinVanity,
          linkedin_headline: linkedinHeadline,
          linkedin_verified: linkedinVerified,
        })
        const method = provider === "google" ? "google" : provider?.startsWith("linkedin") ? "linkedin" : "magic_link"
        signupEvents.oauthCallbackReturned({
          success: "1",
          provider: provider ?? "magic_link",
        })
        const firstSignup = createdAt && Math.abs(Date.now() - new Date(createdAt).getTime()) < 60_000 ? "1" : "0"
        signupEvents.completed({
          method,
          first_signup: firstSignup,
          ref_attributed: result.referral_attributed ? "1" : "0",
          surface: "callback",
        })
        if (isMagicLink) {
          signupEvents.magicLinkConsumed({ latency_ms: Date.now() - arrivedAt })
        }
        const dest = next ?? (firstSignup === "1" ? "/onboarding" : "/home")
        router.replace(dest)
      } catch (err) {
        signupEvents.oauthCallbackReturned({
          success: "0",
          provider: provider ?? "magic_link",
          error_code: err instanceof Error ? err.message.slice(0, 60) : "post_signin_failed",
        })
        // Still land the user — they're authenticated, post-signin is best-effort.
        router.replace(next ?? "/home")
      }
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

    const timeout = setTimeout(() => {
      if (!handled.current) router.replace("/login")
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router, searchParams])

  return (
    <main style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      background: "var(--tm-bg)",
      color: "var(--tm-text-muted)",
      fontSize: 14,
      fontFamily: "var(--font-sans), sans-serif",
    }}>
      <div style={{
        width: 28, height: 28,
        borderRadius: "50%",
        border: "2px solid var(--tm-border)",
        borderTopColor: "var(--tm-accent)",
        animation: "tm-spin 720ms linear infinite",
      }} aria-hidden="true" />
      Signing you in…
      <style>{`@keyframes tm-spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  )
}
