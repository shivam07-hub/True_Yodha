"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { setSessionTokens } from "@/lib/session"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })
        router.replace("/market")
      } else {
        router.replace("/login")
      }
    })
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
