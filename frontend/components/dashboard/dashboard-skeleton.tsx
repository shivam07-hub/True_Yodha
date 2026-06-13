import "./dashboard.css"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading shape for <Dashboard>, co-located beside it. Reuses the real `db-*`
 * classes — `db` wrapper, `db-head` segment row, `db-feed` of `db-card`s — so
 * the live feed lands in the same shape with no reflow. Decorative; aria-hidden.
 */
export function DashboardSkeleton() {
  return (
    <div className="db" aria-hidden="true">
      <div className="db-head">
        <div className="db-segments">
          {[100, 78, 56].map((w, i) => (
            <Skeleton key={i} style={{ width: w, height: 32, borderRadius: 999 }} />
          ))}
        </div>
        <div className="db-head-actions">
          <Skeleton style={{ width: 104, height: 36, borderRadius: 10 }} />
          <Skeleton style={{ width: 140, height: 36, borderRadius: 10 }} />
        </div>
      </div>

      <div className="db-feed">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="db-card" style={{ cursor: "default" }}>
            <div className="db-card-main">
              <Skeleton style={{ width: 42, height: 42, borderRadius: 10 }} />
              <div className="db-card-body">
                <Skeleton style={{ width: 90, height: 12, borderRadius: 4 }} />
                <Skeleton style={{ width: "80%", height: 18, borderRadius: 4, marginTop: 4 }} />
                <Skeleton style={{ width: 150, height: 12, borderRadius: 4, marginTop: 4 }} />
                <Skeleton style={{ width: "60%", height: 12, borderRadius: 4, marginTop: 4 }} />
              </div>
              <Skeleton style={{ width: 54, height: 54, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
