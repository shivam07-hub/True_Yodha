"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/hooks/use-auth"
import { useViewport } from "@/mobile"
import { CollectionsSurface } from "@/mobile/redesign/collections-surface"

/**
 * /collections — the mobile Collections tab (handoff IA swap). Mobile-only:
 * desktop has its own saved-jobs surfaces (dashboard / CV & Applications) and
 * no chrome link here, so a desktop hit redirects home rather than shipping an
 * unstyled second layout.
 */
export default function CollectionsPage() {
  const { token } = useAuth()
  const { mode } = useViewport()
  const router = useRouter()

  // Gate on viewport `mode` (matches the mobile chrome breakpoint). Desktop
  // has its own saved-jobs surfaces and no chrome link here → send it to the
  // market, never the legacy /home (which duplicates this view).
  useEffect(() => {
    if (mode !== "mobile") router.replace("/market")
  }, [mode, router])

  if (mode !== "mobile") return null
  return <CollectionsSurface token={token ?? ""} />
}
