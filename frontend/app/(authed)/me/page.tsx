"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { ProfileSurface } from "@/mobile/redesign/profile-surface"

/**
 * /me — the mobile Profile tab (handoff IA swap): score + missions + hub list,
 * absorbing the retired avatar sheet. Mobile-only; desktop keeps its own
 * dashboard + web-chrome, so a desktop hit redirects home.
 */
export default function ProfilePage() {
  const { token } = useAuth()
  const { isDesktop } = useViewport()
  const router = useRouter()

  useEffect(() => {
    if (isDesktop) router.replace("/home")
  }, [isDesktop, router])

  if (isDesktop) return null
  return <ProfileSurface token={token ?? ""} />
}
