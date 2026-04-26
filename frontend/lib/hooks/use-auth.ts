"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { clearSessionTokens, getAccessToken } from "@/lib/session"

export function useAuth() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = getAccessToken()
    if (!t) {
      router.replace("/login")
    } else {
      setToken(t)
    }
    setReady(true)
  }, [router])

  function signOut() {
    clearSessionTokens()
    router.push("/login")
  }

  return { token, ready, signOut }
}
