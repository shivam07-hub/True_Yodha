/* Single seam both shells (desktop topbar + public authed bar) consume for the
 * nav view-model: which items render and the shared gate ctx.
 *
 * Full map, day one (unified-structure grill 2026-07-16, lock #7): every journey
 * stage is always visible, so the old progressive-unlock coachmark queue, NEW
 * pills, and localStorage seen-guards are retired. The only remaining gate is
 * Myrology's free opt-in (a side offering, not a journey stage). Its remaining
 * gate is carried by users.me; tailored CV versions belong to the CV journey
 * and global chrome must not fetch them just because it mounted.
 */
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { users } from "@/lib/api"
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
  /** Loading flag for the profile-backed gate (drives data-shaped skeletons). */
  loading: boolean
  visibleDesktop: NavItem[]
  /** Shared-content surfaces (Intel, Newsletter, opted-in Myrology). */
  content: NavItem[]
}

export function useNavUnlocks(): NavUnlocksVm {
  // Passive read: the public nav consumes this hook, so it must NEVER gate an
  // anonymous visitor. Token only decides whether the profile query runs.
  const { token } = useSession()
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const ctx = useMemo(() => deriveNavUnlockCtx(undefined, profile), [profile])
  const cvPresence = cvPresenceFromProfile(profile)

  // Myrology renders in the left content cluster (beside Newsletter), not in the
  // primary workspace tabs — it is a side offering, not core workflow. It keeps
  // its free-opt-in gate + violet treatment; pulled out of visibleDesktop below.
  const myrologyItem = useMemo(() => AUTHED_NAV.find((i) => i.id === "myrology"), [])
  const myrologyVisible = !!myrologyItem && isNavItemUnlocked(myrologyItem, ctx)

  return {
    ctx,
    cvPresence,
    loading: profileLoading,
    visibleDesktop: visibleNavItems("desktop", ctx).filter((i) => i.id !== "myrology"),
    content: myrologyVisible && myrologyItem ? [...CONTENT_NAV, myrologyItem] : CONTENT_NAV,
  }
}
