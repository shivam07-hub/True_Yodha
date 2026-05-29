import { Skeleton } from "@/components/ui/skeleton"

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

export function SkillsSkeleton() {
  return (
    <div className="tm-page-enter" aria-hidden="true" style={PAGE}>
      <Header titleW={280} />
      <StatTiles n={4} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <Card key={i} h={120} />
        ))}
      </div>
    </div>
  )
}

export function JobsSkeleton() {
  return (
    <div className="tm-page-enter" aria-hidden="true" style={PAGE}>
      <Header titleW={200} />
      {/* filter row: search + two selects */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <Bar w={260} h={34} r={8} />
        <Bar w={180} h={34} r={8} />
        <Bar w={160} h={34} r={8} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} h={96} />
        ))}
      </div>
    </div>
  )
}

export function CvSkeleton() {
  return (
    <div className="cvb-scope" aria-hidden="true" style={{ overflowY: "auto", height: "100%" }}>
      <div className="cvb-page" style={{ padding: "var(--tm-page-py, 28px) var(--tm-page-px, 32px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Bar w={220} h={26} r={8} />
            <Bar w={340} h={13} r={4} />
          </div>
          <Bar w={130} h={38} r={10} />
        </div>
        <Card h={280} />
      </div>
    </div>
  )
}

export function ForgeSkeleton() {
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
export function skeletonForPath(pathname: string): React.ReactNode {
  if (pathname.startsWith("/home")) return <DashboardSkeleton />
  if (pathname.startsWith("/skills")) return <SkillsSkeleton />
  if (pathname.startsWith("/cv")) return <CvSkeleton />
  if (pathname.startsWith("/forge")) return <ForgeSkeleton />
  if (pathname.startsWith("/tracker")) return <TrackerSkeleton />
  return <GenericPageSkeleton />
}

export function TrackerSkeleton() {
  return (
    <div aria-hidden="true" style={{ ...PAGE, display: "flex", flexDirection: "column", gap: 18, paddingBottom: 80 }}>
      <Bar w={220} h={26} r={8} />
      {/* kanban columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {[0, 1, 2, 3].map((col) => (
          <div key={col} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Bar w={"60%"} h={14} r={4} />
            {[0, 1, 2].map((c) => (
              <Card key={c} h={78} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
