import "./dashboard.css"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading shape for <Dashboard>, co-located beside it (grill Q13). Reuses the
 * real `db-*` classes — `db` wrapper, `db-head` segment row, `db-grid` of
 * `db-tile`s — so the live feed lands in the same grid with no reflow. Replaces
 * the old page-level 5-tile placeholder that mirrored the pre-merge layout.
 * Decorative only; aria-hidden.
 */
export function DashboardSkeleton() {
  return (
    <div className="db" aria-hidden="true">
      <div className="db-head">
        <div className="db-segments">
          {[88, 72, 56].map((w, i) => (
            <Skeleton key={i} style={{ width: w, height: 32, borderRadius: 999 }} />
          ))}
        </div>
        <Skeleton style={{ width: 132, height: 32, borderRadius: 8 }} />
      </div>

      <div className="db-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="db-tile" style={{ cursor: "default" }}>
            <Skeleton style={{ width: 80, height: 12, borderRadius: 4 }} />
            <Skeleton style={{ width: "85%", height: 16, borderRadius: 4 }} />
            <Skeleton style={{ width: 48, height: 22, borderRadius: 4, marginTop: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
