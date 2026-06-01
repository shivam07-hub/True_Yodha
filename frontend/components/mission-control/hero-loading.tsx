import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading shape for <Hero>, co-located beside it so a layout change to the hero
 * forces this to move with it — no central skeleton to orphan (dashboard-loading
 * grill Q4/Q13). Reuses the real `mc-*` classes so the live Hero lands in the
 * exact same positions with no reflow. Decorative only; aria-hidden.
 */
export function HeroLoading() {
  const bar = (w: number | string, h: number, r = 6) => (
    <Skeleton style={{ width: w, height: h, borderRadius: r }} />
  )
  return (
    <div className="mc-hero" aria-hidden="true">
      <div>
        {bar(320, 34, 10)}
        <div style={{ marginTop: 12 }}>{bar(200, 14, 4)}</div>
        <div className="mc-checkpoints" style={{ marginTop: 18 }}>
          {[64, 78, 52, 84, 60].map((w, i) => (
            <Skeleton key={i} style={{ width: w, height: 24, borderRadius: 999 }} />
          ))}
        </div>
      </div>

      <div className="mc-score-panel">
        {bar(150, 11, 4)}
        <div style={{ marginTop: 14 }}>{bar(108, 40, 10)}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {bar("50%", 52, 10)}
          {bar("50%", 52, 10)}
        </div>
      </div>
    </div>
  )
}
