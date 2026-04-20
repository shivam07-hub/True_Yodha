"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function useAuth() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem("mirror_token")
    if (!t) {
      router.replace("/login")
    } else {
      setToken(t)
    }
    setReady(true)
  }, [router])

  function signOut() {
    localStorage.removeItem("mirror_token")
    router.push("/login")
  }

  return { token, ready, signOut }
}
