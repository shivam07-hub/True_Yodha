/* Single source of truth for the authed nav.
 *
 * Full map, day one (unified-structure grill 2026-07-16, lock #7): every
 * journey stage is always visible — the nav IS the product map, and a day-1
 * user must see the whole path. Stages without prerequisites render honest
 * empty states pointing at the one unlock action; nothing hides. The old
 * progressive-disclosure gating (2026-05-29) + its coachmark queue are retired.
 * Only Myrology keeps a gate — a side offering revealed by free opt-in, not a
 * journey stage.
 *
 * Skills is intentionally absent from the nav — the page stays routable
 * via score-tap / ?skill= / ?domain= deep-links and a bridge link in Practice.
 */
import type { CVVersion, UserProfile } from "@/lib/api"

export type NavStage = "base" | "gated"
export type NavSurface = "desktop" | "mobile"

/** Inputs the gate decides on. Derived from the two real queries every authed page shares. */
export interface NavUnlockCtx {
  /** A baseline CV has been uploaded — gates the CV & Applications workspace. */
  hasBaseline: boolean
  /** Count of tailored CV versions (kind ≠ baseline_upload). */
  tailoredCount: number
  /** Distinct companies with at least one tailored CV. */
  tailoredCompanies: number
  /** Free opt-in interest — drives Myrology nav visibility. */
  myrologyInterested: boolean
  /** Paid Myrology entitlement — guards routes/panel, not nav visibility. */
  myrologyUnlocked: boolean
}

export interface NavItem {
  /** Stable id, also the gate key for Myrology. */
  id: "home" | "forge" | "market" | "cv" | "tracker" | "myrology" | "intel" | "newsletter"
  href: string
  label: string
  /** Native title attribute / tooltip. */
  desc: string
  stage: NavStage
  /** Where the item renders as a nav link. Forge is desktop-only — on mobile it is the top XP pill, not a bottom slot. */
  surfaces: NavSurface[]
  /** Bottom-bar icon name (mobile surface only). */
  mobileIcon?: "mission" | "intel" | "cv" | "tracker"
  /** Gate predicate for stage === "gated". Base items are always visible. */
  unlock?: (ctx: NavUnlockCtx) => boolean
  /** Violet special treatment (Myrology). */
  special?: boolean
  /** Shows the stale-application "9+" pill. */
  stalePill?: boolean
}

/** Authed nav, in render order.
 *
 * Live Job Data leads the nav (job-feed redesign grill 2026-06-01): it is now a
 * browsable Inshorts-style job-card feed and the primary daily surface. Order
 * only — the post-login LANDING route stays /home so the first-run 10-min-CV
 * onboarding promise is unchanged. */
export const AUTHED_NAV: NavItem[] = [
  {
    id: "market",
    href: "/market",
    // "Jobs" not "Live" (intel-authed grill 2026-06-16, Q12): /intel now also
    // sits in the nav as "Intel", so the personal openings feed needs a word
    // that says *act* — "Jobs" — not collide with the market mirror. The pulsing
    // live-dot stays on it (see TopbarNav) as the freshness signal.
    label: "Jobs",
    desc: "Openings matched to you — save, apply, tailor",
    stage: "base",
    surfaces: ["desktop", "mobile"],
    mobileIcon: "intel",
  },
  {
    // Collections replaced the /home dashboard (2026-07-07 cutover): the saved
    // worklist is the surface; browse lives on Jobs. `id` stays "home" — it is
    // only the coachmark/localStorage key and the topbar icon selector.
    id: "home",
    href: "/collections",
    label: "Collections",
    desc: "Your saved roles — tailor next, finish, apply",
    stage: "base",
    surfaces: ["desktop", "mobile"],
    mobileIcon: "mission",
  },
  // Practice (forge) is hidden from the nav while the page is under
  // development — the surface isn't ready to work yet. The /forge route still
  // exists (next.config keeps it routable) and the "forge" id stays in the
  // NavItem union so restoring is a one-object add, not a contract change.
  // Re-add the item here when Practice is shippable.
  {
    // Tracker merged into CV (tracker→CV merge grill 2026-06-02); desktop splits
    // this slot into CV + Prep tabs (topbar-nav). Always visible (unified-structure
    // lock #7): a no-CV user lands on the upload door, not a locked tab.
    id: "cv",
    href: "/cv",
    label: "CV & Applications",
    desc: "Your CV, stories, and score",
    stage: "base",
    surfaces: ["desktop", "mobile"],
    mobileIcon: "cv",
    stalePill: true,
  },
  {
    id: "myrology",
    href: "/myrology",
    label: "Myrology",
    desc: "Cosmic career intelligence",
    stage: "gated",
    surfaces: ["desktop"],
    special: true,
    // Free opt-in reveals the icon; the intro+confirm prompt is the introduction.
    unlock: (ctx) => ctx.myrologyInterested,
  },
]

/** Shared-content bucket (intel-authed grill 2026-06-16, Q11–13).
 *
 * Login is a *continuation*, not a different app: the marketing-site surfaces
 * that are actually product content — the live market mirror and the
 * newsletter — must not vanish at the door. They render as a secondary cluster
 * on desktop (right of the workspace tabs) and inside the account menu on
 * mobile, where the 5-slot bottom bar has no room. Always visible (no gate);
 * `surfaces` left empty because these never sit in the primary tab bars — the
 * shells render CONTENT_NAV explicitly, not via visibleNavItems(). */
export const CONTENT_NAV: NavItem[] = [
  {
    id: "intel",
    href: "/intel",
    label: "Intel",
    desc: "The whole market — companies, industries, cities, and your fit",
    stage: "base",
    surfaces: [],
  },
  {
    id: "newsletter",
    href: "/newsletter",
    label: "Newsletter",
    desc: "Weekly hiring signals, read from live job data",
    stage: "base",
    surfaces: [],
  },
]

/** Tailored versions = anything that isn't the raw baseline upload. */
export function tailoredVersions(versions: CVVersion[]): CVVersion[] {
  return versions.filter((v) => v.kind !== "baseline_upload")
}

/** Distinct, non-empty company names across tailored versions. */
export function distinctTailoredCompanies(versions: CVVersion[]): number {
  const set = new Set<string>()
  for (const v of tailoredVersions(versions)) {
    const name = (v.company_name ?? "").trim().toLowerCase()
    if (name) set.add(name)
  }
  return set.size
}

/** Build the gate context from the two real queries. Tolerant of undefined while loading. */
export function deriveNavUnlockCtx(
  versions: CVVersion[] | undefined,
  profile: Pick<UserProfile, "myrology_interested" | "myrology_unlocked"> | undefined,
): NavUnlockCtx {
  const vs = versions ?? []
  return {
    hasBaseline: vs.some((v) => v.kind === "baseline_upload"),
    tailoredCount: tailoredVersions(vs).length,
    tailoredCompanies: distinctTailoredCompanies(vs),
    myrologyInterested: profile?.myrology_interested ?? false,
    myrologyUnlocked: profile?.myrology_unlocked ?? false,
  }
}

/** A base item is always visible; a gated item shows once its unlock predicate passes. */
export function isNavItemUnlocked(item: NavItem, ctx: NavUnlockCtx): boolean {
  if (item.stage === "base") return true
  return item.unlock ? item.unlock(ctx) : false
}

/** Visible nav items for a given surface. */
export function visibleNavItems(surface: NavSurface, ctx: NavUnlockCtx): NavItem[] {
  return AUTHED_NAV.filter(
    (item) => item.surfaces.includes(surface) && isNavItemUnlocked(item, ctx),
  )
}

/** Whether the operator has not yet delivered the promise once (first-run). */
export function isFirstRun(ctx: NavUnlockCtx): boolean {
  return ctx.tailoredCount === 0
}

/**
 * First-run decided straight from the two backing queries, treating the
 * not-yet-resolved window as NOT first-run.
 *
 * `deriveNavUnlockCtx(undefined, …)` collapses to tailoredCount 0, which makes
 * `isFirstRun` read TRUE before `cv.versions` has loaded — so a returning power
 * user briefly looks first-run and the "FIRST CV IN 10 min" promise pill flashes
 * on their topbar (dashboard-loading grill Q3). First-run is a claim we only
 * make once it's PROVEN: both queries resolved AND zero tailored versions.
 * Unknown → not-first-run is the safe default (never tell a veteran "your first CV").
 */
export function firstRunFromData(
  versions: CVVersion[] | undefined,
  profile: Pick<UserProfile, "myrology_interested" | "myrology_unlocked"> | undefined,
): boolean {
  if (versions === undefined || profile === undefined) return false
  return isFirstRun(deriveNavUnlockCtx(versions, profile))
}