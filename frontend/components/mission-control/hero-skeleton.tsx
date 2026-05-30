import { Skeleton } from "@/components/ui/skeleton"
import type { LoadingPhase } from "@/components/loading/use-loading-phase"
import { LOADING_PHASE_COPY } from "@/lib/failure-copy"

/**
 * Layout mirror of the real Dashboard (Hero + matches). Reuses the same
 * `.mc-*` layout classes the loaded page uses, so when real content swaps in
 * it lands in the exact same positions — no reflow, no pop. Rendered by
 * home/page.tsx while auth + core queries are still resolving; never a
 * full-screen spinner. Relies on mission-control.css being imported by the
 * page module (it is, at the top of home/page.tsx).
 *
 * `phase` drives a polite live region so a slow load reassures instead of
 * sitting silent (and indistinguishable from a frozen one). The visual bars
 * stay aria-hidden; the status line is the one thing a screen reader hears.
 */
export function HomeSkeleton({ phase = "normal" }: { phase?: LoadingPhase }) {
  const sk = (w: number | string, h: number, r = 8) => (
    <Skeleton style={{ width: w, height: h, borderRadius: r }} />
  )
  const phaseText = phase === "stuck" ? LOADING_PHASE_COPY.stuck : LOADING_PHASE_COPY.slow
  return (
    <>
      {/* Reassurance line — visible only once the load is slow, always announced. */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 76,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 12,
          color: "var(--tm-text-faint)",
          fontFamily: "var(--tm-font-sans)",
          pointerEvents: "none",
          zIndex: 5,
          opacity: phase === "normal" ? 0 : 1,
          transition: "opacity 200ms ease",
        }}
      >
        {phase === "normal" ? "Loading your dashboard…" : phaseText}
      </div>
      <div className="mc-scope" aria-hidden="true" style={{ overflowY: "auto", height: "100%" }}>
      <div className="mc-page">
        <div className="mc-inner">
          {/* topbar controls (right-aligned) */}
          <div className="mc-topbar">
            {sk(96, 34, 10)}
            {sk(96, 34, 10)}
            {sk(120, 34, 10)}
          </div>

          {/* hero: left greeting + next-moves, right score panel */}
          <div className="mc-hero">
            <div>
              {sk(360, 40, 10)}
              <div style={{ marginTop: 10 }}>{sk(220, 14, 4)}</div>

              {/* checkpoint pills row */}
              <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                {[64, 78, 52, 84, 60].map((w, i) => (
                  <Skeleton key={i} style={{ width: w, height: 24, borderRadius: 999 }} />
                ))}
              </div>

              {/* NEXT MOVES card */}
              <div
                style={{
                  marginTop: 22,
                  border: "1px solid var(--tm-border-soft)",
                  borderRadius: "var(--tm-radius-lg, 14px)",
                  background: "var(--tm-surface)",
                  padding: 16,
                  maxWidth: 560,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {sk(90, 12, 4)}
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Skeleton style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      {sk("60%", 13, 4)}
                      {sk("40%", 10, 4)}
                    </div>
                    {sk(48, 18, 6)}
                  </div>
                ))}
              </div>
            </div>

            {/* score panel */}
            <div
              style={{
                width: 260,
                border: "1px solid var(--tm-border-soft)",
                borderRadius: "var(--tm-radius-lg, 14px)",
                background: "var(--tm-surface)",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {sk(140, 11, 4)}
              {sk(110, 44, 10)}
              <div style={{ display: "flex", gap: 12 }}>
                {sk("50%", 56, 10)}
                {sk("50%", 56, 10)}
              </div>
              {sk(150, 11, 4)}
              {sk("100%", 60, 10)}
            </div>
          </div>

          {/* matches rows */}
          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 12 }}>
            {sk(120, 12, 4)}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} style={{ width: 220, height: 76, borderRadius: 12 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
