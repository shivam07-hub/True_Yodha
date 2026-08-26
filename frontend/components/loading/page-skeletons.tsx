import { Skeleton } from "@/components/ui/skeleton"
import { PrepRoomSkeleton, PrepSkeleton } from "@/components/preparations/prep-skeleton"
import { CVRouteSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-route-skeleton"

/**
 * Layout-matched skeletons for the authed tabs. Each mirrors the real page's
 * structure closely enough that when content swaps in it lands in the same
 * place — no blank body, no popping-in. Rendered inline by each page while
 * auth + that page's core query are still resolving. `isLoading` flips false
 * on error too, so a failing query can never wedge a skeleton on forever.
 */

const PAGE: React.CSSProperties = {
  padding: "var(--tm-page-py, 28px) var(--tm-page-px, 32px)",
  overflowY: "auto",
  height: "100%",
}

function Bar({ w, h = 14, r = 6, mt }: { w: number | string; h?: number; r?: number; mt?: number }) {
  return <Skeleton style={{ width: w, height: h, borderRadius: r, marginTop: mt }} />
}

function Card({ h, children }: { h?: number; children?: React.ReactNode }) {
  return (
    <div
      style={{
        height: h,
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg, 14px)",
        background: "var(--tm-surface)",
        padding: 16,
      }}
    >
      {children}
    </div>
  )
}

function Header({ titleW = 240, sub = true }: { titleW?: number; sub?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
      <Bar w={120} h={11} r={4} />
      <Bar w={titleW} h={28} r={8} />
      {sub && <Bar w={360} h={13} r={4} />}
    </div>
  )
}

function StatTiles({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: 12, marginBottom: 24 }}>
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} style={{ height: 84, borderRadius: "var(--tm-radius-lg, 12px)" }} />
      ))}
    </div>
  )
}




export function PracticeSkeleton() {
  return (
    <div className="tm-page-enter" aria-hidden="true" style={{ minHeight: "100%", padding: "var(--tm-page-py, 28px) var(--tm-page-px, 32px)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <Bar w={200} h={26} r={8} />
        <Bar w={120} h={34} r={10} />
      </div>
      {/* forge stage: two-column card */}
      <div
        style={{
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-lg, 14px)",
          background: "linear-gradient(180deg, var(--tm-int-bg-subtle), var(--tm-surface) 42%)",
          padding: 24,
          display: "grid",
          gridTemplateColumns: "minmax(260px, 0.9fr) minmax(280px, 1.1fr)",
          gap: 24,
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", placeItems: "center" }}>
          <Skeleton style={{ width: 180, height: 180, borderRadius: "50%" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Bar w={"70%"} h={20} r={6} />
          <Bar w={"90%"} h={13} r={4} />
          <Bar w={"60%"} h={13} r={4} />
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <Bar w={120} h={36} r={10} />
            <Bar w={120} h={36} r={10} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1].map((i) => (
          <Card key={i} h={110} />
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="tm-page-enter" aria-hidden="true" style={PAGE}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "start" }}>
        <div>
          <Bar w={340} h={38} r={10} />
          <Bar w={220} h={14} r={4} mt={10} />
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            {[64, 78, 52, 84, 60].map((w, i) => (
              <Skeleton key={i} style={{ width: w, height: 24, borderRadius: 999 }} />
            ))}
          </div>
          <div style={{ marginTop: 22, maxWidth: 560 }}>
            <Card h={180} />
          </div>
        </div>
        <div style={{ width: 260 }}>
          <Card h={240} />
        </div>
      </div>
      <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} style={{ width: 220, height: 76, borderRadius: 12 }} />
        ))}
      </div>
    </div>
  )
}

/**
 * /market is the primary daily surface: CommandRail · job feed · market rail.
 * Mirrors that three-region shape (mc-workspace 248px rail + the feed/rail
 * split) with inline styles, since the page's own CSS modules aren't loaded yet
 * during the auth-bootstrap window. Keeps the bootstrap instant shaped like the
 * destination instead of a generic stat-tile page.
 */
export function MarketSkeleton() {
  const FeedRow = () => (
    <Card>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Skeleton style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Bar w={110} h={13} r={4} />
          <Bar w={"72%"} h={17} r={6} />
          <Bar w={150} h={12} r={4} />
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <Bar w={88} h={22} r={11} />
            <Bar w={116} h={22} r={11} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <Skeleton style={{ width: 40, height: 40, borderRadius: "50%" }} />
          <Bar w={44} h={10} r={4} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <Skeleton style={{ height: 32, borderRadius: 8, flex: 1 }} />
        <Skeleton style={{ height: 32, borderRadius: 8, flex: 1 }} />
        <Skeleton style={{ width: 36, height: 32, borderRadius: 8, flexShrink: 0 }} />
      </div>
    </Card>
  )
  const RailWidget = ({ rows, logo }: { rows: number; logo?: boolean }) => (
    <Card>
      <Bar w={120} h={11} r={4} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {logo && <Skeleton style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />}
            <Skeleton style={{ flex: 1, height: 14, borderRadius: 4, maxWidth: `${70 - i * 6}%` }} />
            <Skeleton style={{ width: 40, height: 12, borderRadius: 4, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </Card>
  )
  return (
    <div className="tm-page-enter" aria-hidden="true" style={{ ...PAGE, maxWidth: 1480, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "248px minmax(0, 1fr)", gap: 28, alignItems: "start" }}>
        {/* CommandRail shape: greeting · 68px score row · chips · moves */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Bar w={170} h={16} r={4} />
          <Bar w={120} h={11} r={4} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Skeleton style={{ width: 68, height: 68, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Bar w={72} h={10} r={4} />
              <Bar w={88} h={14} r={4} />
              <Bar w={110} h={11} r={4} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[92, 78, 118].map((w) => (
              <Skeleton key={w} style={{ width: w, height: 28, borderRadius: 14 }} />
            ))}
          </div>
          {[100, 86, 70].map((w) => (
            <Skeleton key={w} style={{ width: "100%", height: 40, borderRadius: 10 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Bar w={88} h={32} r={16} />
            <Bar w={72} h={32} r={16} />
            <Bar w={80} h={32} r={8} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 28, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <Bar w={64} h={11} r={4} />
                <Bar w={96} h={26} r={13} />
              </div>
              {[0, 1, 2].map((i) => <FeedRow key={i} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <RailWidget rows={6} />
              <RailWidget rows={4} logo />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function IntelSkeleton() {
  // Mirrors the /intel surface: cockpit header (title + standfirst) over the
  // heatmap board — a skill-column header row then several company rows, each a
  // labelled strip of demand cells. Public route with no app-shell skeleton, so
  // this is the surface's only first-paint shape (not a blank + floating footer).
  const cols = 6
  return (
    <div className="tm-page-enter" aria-hidden="true" style={{ ...PAGE, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <Bar w={140} h={11} r={4} />
        <Bar w={300} h={30} r={8} />
        <Bar w={"min(460px, 80%)"} h={14} r={4} />
      </div>
      <Card>
        {/* column header row: a spacer for the row-label gutter + skill columns */}
        <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${cols}, 1fr)`, gap: 10, marginBottom: 14 }}>
          <span />
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} style={{ height: 12, borderRadius: 4, width: `${80 - (i % 3) * 12}%` }} />
          ))}
        </div>
        {/* company rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} style={{ display: "grid", gridTemplateColumns: `160px repeat(${cols}, 1fr)`, gap: 10, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Skeleton style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0 }} />
                <Skeleton style={{ flex: 1, height: 13, borderRadius: 4, maxWidth: `${76 - r * 6}%` }} />
              </div>
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} style={{ height: 34, borderRadius: 8 }} />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function GenericPageSkeleton() {
  return (
    <div className="tm-page-enter" aria-hidden="true" style={PAGE}>
      <Header titleW={240} />
      <StatTiles n={4} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1].map((i) => (
          <Card key={i} h={132} />
        ))}
      </div>
    </div>
  )
}

/**
 * Route → layout-matched skeleton. Used by the app shell during the auth
 * bootstrap window (before chrome can render), so even that instant is shaped
 * like the destination page rather than a centered logo splash.
 */
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
  // /tracker merged into /cv (2026-06-02) — it redirects to /cv → CVRouteSkeleton.
  return <GenericPageSkeleton />
}

