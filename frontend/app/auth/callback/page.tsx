"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { setSessionTokens } from "@/lib/session"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const code = new URLSearchParams(window.location.search).get("code")

    const finish = async (session: { access_token: string; refresh_token: string } | null) => {
      if (!session) { router.replace("/login"); return }

      setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })

      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""
        const res = await fetch(`${base}/users/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.status === 404) { router.replace("/onboarding"); return }
        const profile = await res.json()
        if (!profile.onboarding_complete) { router.replace("/onboarding"); return }
      } catch {
        // network error — fall through to market, they can onboard later
      }

      router.replace("/dashboard")
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data: { session } }) => finish(session))
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => finish(session))
    }
  }, [router])

  return (
    <main style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--tm-bg)", color: "var(--tm-text-muted)", fontSize: 14,
      fontFamily: "var(--font-sans), sans-serif",
    }}>
      Signing you in…
    </main>
  )
}
