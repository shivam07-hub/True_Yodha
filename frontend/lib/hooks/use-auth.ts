"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { clearSessionTokens, getAccessToken, getRefreshToken, setSessionTokens } from "@/lib/session"

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

/**
 * Cold-start session bootstrap. If localStorage has no access token but does
 * have a refresh token, exchange it for a new access token before deciding
 * whether to bounce to /login. Without this hop, a user whose access token
 * expired between visits gets logged out even though their long-lived refresh
 * token is still valid.
 */
// Deduplicate concurrent cold-start bootstraps. Every component that calls
// useAuth() runs this on mount; without the singleton, several would POST
// /auth/refresh in parallel — and Supabase rotates the refresh token on each
// use, so the second call invalidates the first and logs the user out. One
// in-flight promise, shared, cleared on settle so a later cold start can retry.
let _bootstrapInFlight: Promise<string | null> | null = null

async function bootstrapSession(): Promise<string | null> {
  const access = getAccessToken()
  if (access) return access
  if (_bootstrapInFlight) return _bootstrapInFlight

  _bootstrapInFlight = (async () => {
    const refresh = getRefreshToken()
    if (!refresh || !BASE) return null
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
        // Bound the request: a hung connection (server accepts but never responds)
        // would otherwise leave `ready` false forever and wedge the whole app on
        // the shell skeleton. Timeout -> reject -> caught below -> treated as logged out.
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return null
      const data = await res.json() as { access_token: string; refresh_token: string | null }
      setSessionTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
      return data.access_token
    } catch {
      return null
    }
  })().finally(() => {
    _bootstrapInFlight = null
  })

  return _bootstrapInFlight
}

export function useAuth() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const t = await bootstrapSession()
        if (cancelled) return
        if (!t) {
          router.replace("/login")
        } else {
          setToken(t)
        }
      } finally {
        // Guarantee the gate opens no matter what — a thrown bootstrap must never
        // leave the app stuck on the shell skeleton.
        if (!cancelled) setReady(true)
      }
    })()

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "mirror_token") return
      if (e.newValue) setToken(e.newValue)
      else router.replace("/login")
    }
    window.addEventListener("storage", onStorage)
    return () => {
      cancelled = true
      window.removeEventListener("storage", onStorage)
    }
  }, [router])

  function signOut() {
    clearSessionTokens()
    router.push("/login")
  }

  return { token, ready, signOut }
}
