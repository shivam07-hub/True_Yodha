"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { setSessionTokens } from "@/lib/session"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let handled = false

    const finish = async (session: { access_token: string; refresh_token: string }) => {
      if (handled) return
      handled = true

      setSessionTokens({ accessToken: session.access_token, refreshToken: session.refresh_token })
      router.replace("/home")
    }

    // No code in URL — check for an existing session (e.g. email/password callback)
    const code = new URLSearchParams(window.location.search).get("code")
    if (!code) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) finish(session)
        else router.replace("/login")
      })
      return
    }

    // `createBrowserClient` has detectSessionInUrl: true, which means @supabase/auth-js
    // automatically calls exchangeCodeForSession() internally when it detects ?code= in
    // the URL. Calling it again manually would consume the single-use PKCE code a second
    // time → null session → redirect to /login. Instead, listen for the SIGNED_IN event
    // that fires after the internal exchange completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        await finish(session)
      }
    })

    // Fallback: session may already be set if the event fired before we subscribed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(session)
    })

    // Safety net: if neither path resolves within 5s, send to login
    const timeout = setTimeout(() => {
      if (!handled) router.replace("/login")
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
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
