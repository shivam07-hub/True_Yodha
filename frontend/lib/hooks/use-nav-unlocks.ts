/* Single seam both shells (desktop topbar + mobile bottom bar) consume to
 * decide which nav surfaces are visible, and to fire a one-time unlock
 * coachmark when a gated surface flips locked → unlocked mid-session.
 *
 * Decision context: progressive-nav grill 2026-05-29 (Q2, Q7).
 * - Unlocks derive from cv.versions + users.me — the two queries every authed
 *   page already shares. The tailoring mutation already invalidates
 *   dataKeys.cvVersions(null), so the nav recomputes for free; no polling.
 * - Coachmark fires ONLY for transitions during the session. Surfaces already
 *   unlocked when the session started (snapshot at first resolve) never fire —
 *   that fixes the prototype's "re-introduce on every fresh device" flaw.
 *   localStorage `myro_coach_<id>_v1` is a belt-and-suspenders re-fire guard
 *   across reloads. Cosmetic-local per the grill's server-vs-local split.
 */
import { useEffect, useMemo, useRef, useState } from "react"
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

const COACH_SEEN_PREFIX = "myro_coach_"
const COACH_SEEN_SUFFIX = "_v1"

function coachSeenKey(id: string): string {
  return `${COACH_SEEN_PREFIX}${id}${COACH_SEEN_SUFFIX}`
}

function coachSeen(id: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(coachSeenKey(id)) === "1"
  } catch {
    return false
  }
}

function markCoachSeen(id: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(coachSeenKey(id), "1")
  } catch {
    /* private-mode / quota — coachmark may re-show, harmless */
  }
}

export interface NavUnlocksVm {
  ctx: NavUnlockCtx
  /** First-run = promise not yet delivered once (0 tailored CVs). */
  firstRun: boolean
  /** Baseline CV uploaded — the journey has started (drives countdown phase). */
  hasCv: boolean
  /** Loading flag for the two backing queries (drives data-shaped skeletons). */
  loading: boolean
  visibleDesktop: NavItem[]
  visibleMobile: NavItem[]
  /** Shared-content surfaces (Intel, Newsletter) — persist across login. */
  content: NavItem[]
  /** Gated items awaiting their one-time introduction, FIFO. */
  coachQueue: NavItem[]
  /** Front of the queue — the coachmark currently shown, or null. */
  activeCoach: NavItem | null
  /** Ids currently showing the NEW pill. */
  newItems: Set<string>
  /** Acknowledge the active coachmark (Got it / scrim click). Advances the queue. */
  ackCoach: () => void
  /** Clear an item's NEW pill (e.g. after the user visits it). */
  clearNew: (id: string) => void
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

  const [coachQueueIds, setCoachQueueIds] = useState<string[]>([])
  const [newItems, setNewItems] = useState<Set<string>>(new Set())

  // Snapshot of gated surfaces already unlocked when this session started.
  // null until the first real resolve. Items in here never fire a coachmark.
  const mountSnapshot = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (versions === undefined || profile === undefined) return // not resolved yet

    const unlockedGated = AUTHED_NAV.filter(
      (i) => i.stage === "gated" && isNavItemUnlocked(i, ctx),
    ).map((i) => i.id)

    if (mountSnapshot.current === null) {
      // First resolve = baseline. Everything already unlocked is pre-existing,
      // never introduced. Mid-session transitions are everything NOT in here.
      mountSnapshot.current = new Set(unlockedGated)
      return
    }

    const snapshot = mountSnapshot.current
    const freshlyUnlocked = unlockedGated.filter((id) => !snapshot.has(id) && !coachSeen(id))
    if (freshlyUnlocked.length === 0) return

    // Fold into snapshot immediately so a re-render can't re-enqueue.
    for (const id of freshlyUnlocked) snapshot.add(id)
    // Only items WITH coach copy enqueue a coachmark; the rest (e.g. Myrology —
    // "no coachmark here", NEW pill still fires on transition) skip the scrim so
    // a copy-less item never raises a blank, hard-to-dismiss scrim.
    const coachable = freshlyUnlocked.filter((id) => AUTHED_NAV.find((i) => i.id === id)?.coach)
    setCoachQueueIds((q) => [...q, ...coachable.filter((id) => !q.includes(id))])
    setNewItems((prev) => {
      const next = new Set(prev)
      for (const id of freshlyUnlocked) next.add(id)
      return next
    })
  }, [ctx, versions, profile, coachQueueIds])

  const coachQueue = useMemo(
    () =>
      coachQueueIds
        .map((id) => AUTHED_NAV.find((i) => i.id === id))
        .filter((i): i is NavItem => !!i),
    [coachQueueIds],
  )
  const activeCoach = coachQueue[0] ?? null

  function ackCoach() {
    setCoachQueueIds((q) => {
      const [head, ...rest] = q
      if (head) markCoachSeen(head)
      return rest
    })
  }

  function clearNew(id: string) {
    setNewItems((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return {
    ctx,
    // Proven-only: not-first-run until BOTH queries resolve, so a returning
    // user never flashes the first-run promise pill mid-load (grill Q3).
    firstRun: firstRunFromData(versions, profile),
    hasCv: profile?.has_cv ?? false,
    loading: versionsLoading || profileLoading,
    visibleDesktop: visibleNavItems("desktop", ctx).filter((i) => i.id !== "myrology"),
    visibleMobile: visibleNavItems("mobile", ctx),
    content: myrologyVisible && myrologyItem ? [...CONTENT_NAV, myrologyItem] : CONTENT_NAV,
    coachQueue,
    activeCoach,
    newItems,
    ackCoach,
    clearNew,
  }
}