/* Single seam both shells (desktop topbar + public authed bar) consume for the
 * nav view-model: which items render, first-run state, and the shared gate ctx.
 *
 * Full map, day one (unified-structure grill 2026-07-16, lock #7): every journey
 * stage is always visible, so the old progressive-unlock coachmark queue, NEW
 * pills, and localStorage seen-guards are retired. The only remaining gate is
 * Myrology's free opt-in (a side offering, not a journey stage). Unlock ctx
 * still derives from cv.versions + users.me — the two queries every authed page
 * already shares — because first-run (CV-promise pill / Next chip handoff) and
 * the Myrology reveal read it.
 */
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { cv, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useSession } from "@/lib/hooks/use-auth"
import {
  AUTHED_NAV,
  CONTENT_NAV,
  deriveNavUnlockCtx,
  firstRunFromData,
  isNavItemUnlocked,
  visibleNavItems,
  type NavItem,
  type NavUnlockCtx,
} from "@/lib/nav-items"

export interface NavUnlocksVm {
  ctx: NavUnlockCtx
  /** First-run = promise not yet delivered once (0 tailored CVs). */
  firstRun: boolean
  /** Baseline CV uploaded — the journey has started (drives countdown phase). */
  hasCv: boolean
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

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cv.versions.list(token!),
    enabled: !!token,
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

  // Myrology renders in the left content cluster (beside Newsletter), not in the
  // primary workspace tabs — it is a side offering, not core workflow. It keeps
  // its free-opt-in gate + violet treatment; pulled out of visibleDesktop below.
  const myrologyItem = useMemo(() => AUTHED_NAV.find((i) => i.id === "myrology"), [])
  const myrologyVisible = !!myrologyItem && isNavItemUnlocked(myrologyItem, ctx)

  return {
    ctx,
    // Proven-only: not-first-run until BOTH queries resolve, so a returning
    // user never flashes the first-run promise pill mid-load (grill Q3).
    firstRun: firstRunFromData(versions, profile),
    hasCv: profile?.has_cv ?? false,
    loading: versionsLoading || profileLoading,
    visibleDesktop: visibleNavItems("desktop", ctx).filter((i) => i.id !== "myrology"),
    content: myrologyVisible && myrologyItem ? [...CONTENT_NAV, myrologyItem] : CONTENT_NAV,
  }
}
