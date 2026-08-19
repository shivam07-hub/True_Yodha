import { Skeleton } from "@/components/ui/skeleton"
import "./compact-moves.css"

/**
 * Loading shape for <CommandRail>. Reuses the real `mc-rail` / `cmd-rail` /
 * `cmv-*` classes so the live rail lands in the same boxes — greeting, 68px
 * score row, role chips, next-move rows. Decorative; aria-hidden.
 */
export function HeroLoading() {
  return (
    <div className="mc-rail cmd-rail" aria-hidden="true">
      <div className="mc-rail-meta">
        <Skeleton style={{ width: 170, height: 16, borderRadius: 4 }} />
        <Skeleton style={{ width: 120, height: 11, borderRadius: 4 }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Skeleton style={{ width: 68, height: 68, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <Skeleton style={{ width: 72, height: 10, borderRadius: 4 }} />
          <Skeleton style={{ width: 88, height: 14, borderRadius: 4 }} />
          <Skeleton style={{ width: 110, height: 11, borderRadius: 4 }} />
        </div>
      </div>

      <div className="cmd-rail-role" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[92, 78, 118].map((w) => (
          <Skeleton key={w} style={{ width: w, height: 28, borderRadius: "var(--tm-radius-pill)" }} />
        ))}
      </div>

      <nav className="cmv" style={{ pointerEvents: "none" }}>
        <Skeleton style={{ width: 96, height: 10, borderRadius: 4, marginBottom: 8 }} />
        <div className="cmv-list">
          {[100, 86, 70].map((w) => (
            <div key={w} className="cmv-row" style={{ cursor: "default" }}>
              <Skeleton style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0 }} />
              <Skeleton style={{ width: `${w}%`, height: 13, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </nav>
    </div>
  )
}
