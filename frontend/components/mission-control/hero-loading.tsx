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
      </div>

      {/* loop-ring shape: circle + legend + nudge + footnote */}
      <div className="mc-loopring">
        <Skeleton style={{ width: 168, height: 168, borderRadius: 999 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {[58, 64, 44, 70, 52].map((w, i) => (
            <Skeleton key={i} style={{ width: w, height: 22, borderRadius: 999 }} />
          ))}
        </div>
        <div style={{ marginTop: 14 }}>{bar(180, 16, 6)}</div>
        <div style={{ marginTop: 12 }}>{bar(120, 12, 4)}</div>
      </div>
    </div>
  )
}
