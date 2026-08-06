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

      {/* Score dial + moves — the CommandRail shape this hero actually renders.
          (Was a loop-ring skeleton long after the ring left this rail; the ring
          is now deleted outright, so the stale shape goes with it.) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 248, maxWidth: "100%" }}>
        <Skeleton style={{ width: 168, height: 168, borderRadius: 999 }} />
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          {[100, 88, 72].map((w, i) => (
            <Skeleton key={i} style={{ width: `${w}%`, height: 34, borderRadius: 8 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
