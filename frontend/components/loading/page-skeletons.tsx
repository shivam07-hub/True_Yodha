import { PrepRoomSkeleton, PrepSkeleton } from "@/components/preparations/prep-skeleton"
import { CVRouteSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-route-skeleton"
import { SkeletonSkin } from "@/components/loading/skeleton-skin"
import {
  DashboardDesktopSkeleton,
  GenericDesktopSkeleton,
  IntelDesktopSkeleton,
  MarketDesktopSkeleton,
  PracticeDesktopSkeleton,
} from "@/components/loading/desktop-page-skeletons"
import {
  CollectionsMobileSkeleton,
  GenericMobileSkeleton,
  IntelMobileSkeleton,
  JobsMobileSkeleton,
  PracticeMobileSkeleton,
  ProfileMobileSkeleton,
} from "@/components/loading/mobile-page-skeletons"

/**
 * Layout-matched skeletons for the authed tabs. Each export is one route with
 * two skins (desktop workspace / phone surface). CSS shows one, so a phone
 * never watches the three-column Jobs workspace relayout into swipe cards.
 *
 * `isLoading` flips false on error too, so a failing query can never wedge a
 * skeleton on forever.
 */

function RouteSkeleton({ desktop, mobile }: { desktop: React.ReactNode; mobile: React.ReactNode }) {
  return (
    <div className="tm-page-enter" aria-hidden="true">
      <SkeletonSkin desktop={desktop} mobile={mobile} />
    </div>
  )
}

export function PracticeSkeleton() {
  return <RouteSkeleton desktop={<PracticeDesktopSkeleton />} mobile={<PracticeMobileSkeleton />} />
}

export function DashboardSkeleton() {
  return <RouteSkeleton desktop={<DashboardDesktopSkeleton />} mobile={<CollectionsMobileSkeleton />} />
}

export function MarketSkeleton() {
  return <RouteSkeleton desktop={<MarketDesktopSkeleton />} mobile={<JobsMobileSkeleton />} />
}

export function IntelSkeleton() {
  return <RouteSkeleton desktop={<IntelDesktopSkeleton />} mobile={<IntelMobileSkeleton />} />
}

export function GenericPageSkeleton() {
  return <RouteSkeleton desktop={<GenericDesktopSkeleton />} mobile={<GenericMobileSkeleton />} />
}

/**
 * The route boundary's skeleton, by path.
 *
 * THE INVARIANT: whatever this returns for a path must be the SAME component
 * that path's page renders while it boots. Two answers means the user watches
 * one skeleton relayout into another — a "double loading screen" — and the
 * second one is the only one shaped like where they are going.
 *
 * Two branches disagreed with their pages until 2026-08-26:
 *
 *   /home    returned DashboardSkeleton. /home is a RETIRED redirect stub that
 *            replaces itself with /market and renders MarketSkeleton for that
 *            reason. The boundary was painting the shape of a page that no
 *            longer exists, then the stub repainted the destination's shape.
 *            /collections keeps DashboardSkeleton — it is the page that
 *            inherited that layout, and its page.tsx renders it.
 *
 *   /skills  returned SkillsSkeleton (a header, four stat tiles, three cards).
 *            /skills is the score map, and its page renders PracticeSkeleton
 *            for the 180px ring at its centre. Nothing on the real page is a
 *            stat tile.
 *
 * /cv is delegated whole to CVRouteSkeleton: that route has THREE destinations
 * (library, workstation, export) and a pathname alone cannot separate them.
 *
 * Each of those components now carries a phone skin of the live mobile page.
 * CSS picks the skin; the pairing test still keys off the export name.
 */
export function skeletonForPath(pathname: string): React.ReactNode {
  if (pathname.startsWith("/collections")) return <DashboardSkeleton />
  if (pathname.startsWith("/home")) return <MarketSkeleton />
  if (pathname.startsWith("/market")) return <MarketSkeleton />
  if (pathname.startsWith("/intel")) return <IntelSkeleton />
  if (pathname.startsWith("/skills")) return <PracticeSkeleton />
  if (pathname.startsWith("/cv")) return <CVRouteSkeleton />
  if (pathname.startsWith("/practice")) return <PracticeSkeleton />
  if (pathname.startsWith("/preparations/")) return <PrepRoomSkeleton />
  if (pathname.startsWith("/preparations")) return <PrepSkeleton />
  if (pathname.startsWith("/me")) return <ProfileMobileSkeleton />
  // /tracker merged into /cv (2026-06-02) — it redirects to /cv → CVRouteSkeleton.
  return <GenericPageSkeleton />
}
