"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { EdgeGlow } from "@/components/loading/edge-glow"
import { getAccessToken } from "@/lib/session"
import { auth } from "@/lib/api"

/**
 * Browser-extension connect handshake (project_extension_connect_auth).
 *
 * The Myro Chrome extension opens this page via chrome.identity.launchWebAuthFlow
 * with `?redirect_uri=https://<ext-id>.chromiumapp.org/`. When the visitor is
 * signed in we mint a FRESH, INDEPENDENT Supabase session (POST
 * /auth/extension-session) so the extension never shares a refresh-token family
 * with this web session, then bounce the tokens back to the extension in the
 * URL fragment (never the query — fragments are not sent to servers or logged).
 *
 * SECURITY: redirect_uri is validated to be a chrome-extension redirect host
 * BEFORE any token is placed in it. Without this gate, a crafted link with
 * redirect_uri=https://evil.example would exfiltrate the visitor's session.
 */

// Chrome extension IDs are exactly 32 chars from a–p. getRedirectURL() returns
// `https://<id>.chromiumapp.org/`.
const REDIRECT_RE = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/?$/

const API_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

function ConnectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ran = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const redirectUri = searchParams.get("redirect_uri") ?? ""
    if (!REDIRECT_RE.test(redirectUri)) {
      setError("This connect link is invalid. Open the Myro extension and click “Connect with Myro” again.")
      return
    }

    const token = getAccessToken()
    if (!token) {
      // KNOWN GAP: this used to bounce with ?next=/extension/connect, but
      // postAuthDestination has always ignored ?next=, so the user has never
      // come back to finish the handshake — they land on /market and must
      // re-open the extension link. Fixing it properly means stashing the
      // redirect_uri and giving postAuthDestination a carried-intent branch,
      // the same shape as the anon-CV and pending-job-save exceptions.
      router.replace("/login")
      return
    }

    auth
      .extensionSession(token)
      .then((session) => {
        const frag = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          api_url: API_URL,
        })
        if (session.expires_at != null) frag.set("expires_at", String(session.expires_at))
        // Hand the tokens to the extension. launchWebAuthFlow resolves with this
        // URL; the extension parses the fragment. replace() so the tokens don't
        // linger in history.
        window.location.replace(`${redirectUri.replace(/\/$/, "")}/#${frag.toString()}`)
      })
      .catch(() => {
        setError("Couldn’t connect the extension right now. Close this and try again.")
      })
  }, [router, searchParams])

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <p className="max-w-sm text-balance text-[15px] leading-relaxed text-[var(--text-primary,#e8e8ea)]">
          {error}
        </p>
      </main>
    )
  }

  return <EdgeGlow message="Connecting the Myro extension…" />
}

export default function ExtensionConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectInner />
    </Suspense>
  )
}
