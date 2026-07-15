"use client"

import { useAuth } from "@/lib/hooks/use-auth"
import { PrepList } from "@/components/preparations/prep-list"
import "@/components/preparations/preparations.css"

/**
 * /preparations — the post-apply surface (grill-locked 2026-07-15, memory
 * project_preparations_surface). Successor of the retired /cv?view=active
 * "Applications" tab: every applied job gets a prep room; the list is the
 * stage-grouped pipeline. One skin — the layout is a single column that works
 * at 375px as-is.
 */
export default function PreparationsPage() {
  const { token, ready } = useAuth()
  if (!ready) return null
  return <PrepList token={token ?? ""} />
}
