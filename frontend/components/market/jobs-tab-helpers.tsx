import { FeedCardSkeleton } from "@/components/jobs/feed-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { FeedScope } from "@/lib/feed-scope"

export function LocationScopePill({ scope, onOpen }: { scope: FeedScope; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={scope.isEmpty ? "Set your target locations. Open filters" : `Target locations: ${scope.cities.join(", ")}. Open filters`}
      title={scope.cities.length > 1 ? scope.cities.join(", ") : undefined}
      className="tm-feed-summary-loc"
    >
      <span aria-hidden>Location</span> {scope.label}
    </button>
  )
}

export function FeedSkeleton({ rows = 4, summary = false }: { rows?: number; summary?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: summary ? 8 : 16 }} aria-hidden="true">
      {summary ? (
        <div className="tm-feed-summary">
          <Skeleton style={{ width: 64, height: 11, borderRadius: 4 }} />
          <Skeleton style={{ width: 96, height: 26, borderRadius: 999 }} />
          <Skeleton style={{ width: 150, height: 26, borderRadius: 999 }} />
        </div>
      ) : null}
      {Array.from({ length: rows }).map((_, index) => (
        <FeedCardSkeleton key={index} />
      ))}
    </div>
  )
}

export function EmptyHandoff({
  savedCount,
  onBuild,
  onClear,
  onTellMyro,
}: {
  savedCount: number
  onBuild: () => void
  onClear: () => void
  onTellMyro?: () => void
}) {
  return (
    <div style={{ textAlign: "center", padding: "64px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ fontSize: 15, color: "var(--tm-text)", fontWeight: 600 }}>You have triaged everything here</div>
      {savedCount > 0 ? (
        <>
          <div style={{ fontSize: 14, color: "var(--tm-text-muted)" }}>You saved {savedCount} role{savedCount === 1 ? "" : "s"}. Build a CV for each next.</div>
          <button type="button" onClick={onBuild} className="tm-filters-apply">Build CVs</button>
        </>
      ) : (
        <div style={{ fontSize: 14, color: "var(--tm-text-muted)" }}>Fresh roles land daily. Check back, or loosen your filters.</div>
      )}
      {onTellMyro ? (
        <button type="button" onClick={onTellMyro} className="tm-filters-apply">Tell Myro what you want</button>
      ) : null}
      <button type="button" onClick={onClear} style={{ background: "none", border: "none", color: "var(--tm-interactive)", cursor: "pointer", fontSize: 13 }}>Clear filters</button>
    </div>
  )
}
