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

    const finish = (session: { access_token: string; refresh_token: string } | null) => {
      if (session) {
        setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })
        router.replace("/market")
      } else {
        router.replace("/login")
      }
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
