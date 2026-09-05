"use client"

import Script from "next/script"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { getAccessToken } from "@/lib/session"
import { detectInAppBrowser } from "@/lib/is-in-app-browser"
import { signupEvents } from "@/lib/analytics"
import {
  createOneTapNonce,
  googleClientId,
  GSI_CLIENT_SRC,
  type GoogleCredentialResponse,
  type OneTapNonce,
} from "@/lib/auth/google-one-tap"

/**
 * The Google account chooser, over the page. It is the half of "remember me"
 * that a device hint cannot do: it names the visitor on their FIRST visit,
 * from the Google session they already have, with no redirect.
 *
 * Renders nothing at all until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, so the
 * auth surfaces are unchanged until the client ID exists (INFRA.md).
 *
 * A credential hands off to /auth/callback rather than finishing here — that
 * route is the single consumer that runs post-signin side effects, records the
 * device identity and picks the destination. One sign-in path, one finisher.
 */
export function GoogleOneTap({ surface }: { surface: string }) {
  const router = useRouter()
  const clientId = googleClientId()
  const [eligible, setEligible] = useState(false)
  const nonceRef = useRef<OneTapNonce | null>(null)
  const signingIn = useRef(false)

  useEffect(() => {
    if (!clientId) return
    // A signed-in visitor is not asked who they are, and an in-app webview
    // cannot run FedCM — the in-app warning already routes those to a link.
    if (getAccessToken()) return
    if (detectInAppBrowser().inApp) return
    let live = true
    void createOneTapNonce().then((nonce) => {
      if (!live) return
      nonceRef.current = nonce
      setEligible(true)
    })
    return () => {
      live = false
    }
  }, [clientId])

  // Dismiss the prompt when the surface unmounts, so it cannot outlive the
  // screen that asked for it (a modal closing, a route change).
  useEffect(() => {
    return () => {
      window.google?.accounts.id.cancel()
    }
  }, [])

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      const nonce = nonceRef.current
      if (!response.credential || !nonce || signingIn.current) return
      signingIn.current = true
      signupEvents.methodTapped({ method: "google", surface })
      const { error } = await createClient().auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce: nonce.raw,
      })
      if (error) {
        // Never block the form behind a failed prompt: the visitor still has
        // every button on the page.
        signingIn.current = false
        signupEvents.failed({
          method: "google",
          stage: "one_tap",
          error_code: error.code ?? "one_tap_failed",
        })
        return
      }
      router.replace("/auth/callback")
    },
    [router, surface],
  )

  const startPrompt = useCallback(() => {
    const api = window.google?.accounts.id
    const nonce = nonceRef.current
    if (!api || !clientId || !nonce) return
    api.initialize({
      client_id: clientId,
      callback: (response) => void handleCredential(response),
      // Google gets the hash, Supabase gets the original — see createOneTapNonce.
      nonce: nonce.hashed,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: true,
      auto_select: false,
      // Google words its own prompt from this: "Sign in to" vs "Sign up to".
      context: surface.startsWith("signup") ? "signup" : "signin",
    })
    api.prompt()
  }, [clientId, handleCredential, surface])

  if (!clientId || !eligible) return null

  return <Script src={GSI_CLIENT_SRC} strategy="afterInteractive" onReady={startPrompt} />
}
