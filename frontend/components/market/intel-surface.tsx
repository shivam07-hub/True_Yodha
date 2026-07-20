"use client"

import { useSession } from "@/lib/hooks/use-auth"
import { IntelPane } from "@/components/public/intel-pane"
import { IntelWorkspace } from "@/components/market/intel-workspace"

/**
 * /intel is one route, two audiences (L2). The initial SSR render has no token,
 * so crawlers and logged-out visitors get the public intel pane (SEO preserved).
 * Once the session bootstrap resolves for a logged-in user, the surface swaps to
 * the authed intel workspace — the heatmap board + compare strip + focus panel
 * that used to live at /market?tab=heatmap. useSession (never useAuth) so an
 * anonymous visitor is never ejected to /login.
 */
export function IntelSurface() {
  const { token, ready } = useSession()
  if (ready && token) return <IntelWorkspace token={token} />
  return <IntelPane />
}
