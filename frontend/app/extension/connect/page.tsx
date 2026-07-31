"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { EdgeGlow } from "@/components/loading/edge-glow"
import { getAccessToken } from "@/lib/session"
import { auth } from "@/lib/api"
import {
  EXTENSION_REDIRECT_RE,
  clearPendingExtensionConnect,
  stashPendingExtensionConnect,
} from "@/lib/extension-connect-stash"

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
    if (!EXTENSION_REDIRECT_RE.test(redirectUri)) {
      clearPendingExtensionConnect()
      setError("This connect link is invalid. Open the Myro extension and click “Connect with Myro” again.")
      return
    }

    const token = getAccessToken()
    if (!token) {
      // Hold the handshake target so postAuthDestination can bring them back
      // here (Exception 0) — the redirect_uri came from launchWebAuthFlow and
      // cannot be recovered by navigating once this tab moves on.
      stashPendingExtensionConnect(redirectUri)
      router.replace("/login")
      return
    }

    // Signed in and the link is valid: the intent is being served right now, so
    // it must not survive to re-route an unrelated login later in this tab.
    clearPendingExtensionConnect()

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
