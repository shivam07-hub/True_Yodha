/* Single seam both shells (desktop topbar + public authed bar) consume for the
 * nav view-model: which items render and the shared gate ctx.
 *
 * Full map, day one (unified-structure grill 2026-07-16, lock #7): every journey
 * stage is always visible, so the old progressive-unlock coachmark queue, NEW
 * pills, and localStorage seen-guards are retired. The only remaining gate is
 * Myrology's free opt-in (a side offering, not a journey stage). Unlock ctx
 * still derives from cv.versions + users.me — the two queries every authed page
 * already shares — because the global Next action and the Myrology reveal read it.
 */
import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { cv, users } from "@/lib/api"
import { cvPresenceFromProfile, type CvPresence } from "@/lib/cv-presence"
import { dataKeys } from "@/lib/domain-data"
import { useSession } from "@/lib/hooks/use-auth"
import {
  AUTHED_NAV,
  CONTENT_NAV,
  deriveNavUnlockCtx,
  isNavItemUnlocked,
  visibleNavItems,
  type NavItem,
  type NavUnlockCtx,
} from "@/lib/nav-items"

export interface NavUnlocksVm {
  ctx: NavUnlockCtx
  /** Authoritative CV state; `unknown` must never be rendered as `absent`. */
  cvPresence: CvPresence
  /** Loading flag for the two backing queries (drives data-shaped skeletons). */
  loading: boolean
  visibleDesktop: NavItem[]
  /** Shared-content surfaces (Intel, Newsletter, opted-in Myrology). */
  content: NavItem[]
}

export function useNavUnlocks(): NavUnlocksVm {
  // Passive read: the public nav consumes this hook, so it must NEVER gate an
  // anonymous visitor. Token only decides whether the two backing queries run.
  const { token } = useSession()
  const pathname = usePathname()

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cv.versions.list(token!),
    // Every journey stage is always visible. CV versions only affect the
    // side-offering context, so Jobs must not pay for them before its feed.
    enabled: !!token && pathname !== "/market",
    staleTime: 60 * 1000,
  })
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const versions = versionsData?.versions
  const ctx = useMemo(() => deriveNavUnlockCtx(versions, profile), [versions, profile])
  const cvPresence = cvPresenceFromProfile(profile)

  // Myrology renders in the left content cluster (beside Newsletter), not in the
  // primary workspace tabs — it is a side offering, not core workflow. It keeps
  // its free-opt-in gate + violet treatment; pulled out of visibleDesktop below.
  const myrologyItem = useMemo(() => AUTHED_NAV.find((i) => i.id === "myrology"), [])
  const myrologyVisible = !!myrologyItem && isNavItemUnlocked(myrologyItem, ctx)

  return {
    ctx,
    cvPresence,
    loading: versionsLoading || profileLoading,
    visibleDesktop: visibleNavItems("desktop", ctx).filter((i) => i.id !== "myrology"),
    content: myrologyVisible && myrologyItem ? [...CONTENT_NAV, myrologyItem] : CONTENT_NAV,
  }
}
