/* Single source of truth for the authed progressive-disclosure nav.
 *
 * Decision context: progressive-nav grill 2026-05-29 (Q1, Q2, Q8, Q11).
 * First-run operators see only the 3 base surfaces that deliver the 10-min-CV
 * promise (Dashboard / Practice / Live Job Data). CV Library, Tracker and
 * Myrology gate on real milestones derived client-side from cv.versions +
 * users.me — never from the phantom /onboarding/state endpoint (which does not
 * exist). Gating spans BOTH the desktop topbar and the mobile bottom bar, so
 * the unlock logic must live once here or it drifts across the two shells.
 *
 * Skills is intentionally absent from the nav (Q1) — the page stays routable
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

export interface NavCoach {
  /** Eyebrow tag, e.g. "UNLOCKED · FIRST CV READY". */
  tag: string
  /** One-line body the coachmark introduces the surface with. */
  body: string
}

export interface NavItem {
  /** Stable id, also the localStorage coachmark-seen key suffix and the gate key. */
  id: "home" | "forge" | "market" | "cv" | "tracker" | "myrology"
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
  /** Coachmark copy fired once when a gated surface flips locked → unlocked. */
  coach?: NavCoach
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
    // A pulsing dot precedes this label in the topbar (see TopbarNav) — the live
    // signal lives in the nav now, not beside the in-page Jobs|Heatmap toggle.
    label: "Live",
    desc: "Browse openings read live from career pages",
    stage: "base",
    surfaces: ["desktop", "mobile"],
    mobileIcon: "intel",
  },
  {
    id: "home",
    href: "/home",
    label: "Dashboard",
    desc: "Tackle Today",
    stage: "base",
    surfaces: ["desktop", "mobile"],
    mobileIcon: "mission",
  },
  {
    id: "forge",
    href: "/forge",
    label: "Practice",
    desc: "Close the gap — timer + diary",
    stage: "base",
    surfaces: ["desktop"],
  },
  {
    // Tracker merged into CV (tracker→CV merge grill 2026-06-02): /cv is now the
    // Career Workspace — Master CV + the full application pipeline (kanban,
    // verdicts, stale-recovery, manual-add) on one surface. The standalone
    // /tracker route is gone (next.config redirects it here). Unlock moves to
    // hasBaseline so pursuits are reachable from the first SAVED job, not the
    // second tailored company. stalePill migrates here from the dead tracker item.
    id: "cv",
    href: "/cv",
    label: "CV & Applications",
    desc: "Build your CV · track every application",
    stage: "gated",
    surfaces: ["desktop", "mobile"],
    mobileIcon: "cv",
    stalePill: true,
    unlock: (ctx) => ctx.hasBaseline,
    coach: {
      // ≤3 impactful words per brand rule (grill Q10). Exact copy → /ux-copy.
      tag: "UNLOCKED · WORKSPACE",
      body: "Build. Track. Win.",
    },
  },
  {
    id: "myrology",
    href: "/myrology",
    label: "Myrology",
    desc: "Cosmic career intelligence",
    stage: "gated",
    surfaces: ["desktop"],
    special: true,
    // Free opt-in reveals the icon; the intro+confirm prompt is the
    // introduction, so no coachmark here (NEW pill still fires on transition).
    unlock: (ctx) => ctx.myrologyInterested,
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