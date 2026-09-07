import { Skeleton } from "@/components/ui/skeleton"
import "@/app/(authed)/home/mission-control.css"
import "./preparations.css"
import "./skill-path-rail.css"
import "./training-card.css"

/**
 * Layout-matched loading for Preparations. Uses the live workspace classes
 * (tm-intel-page · mc-workspace · prp-lroom · prp-stand) so the swap to content
 * does not move the page. The rail's own copy stays — "Prep", the four step
 * labels and the Finlatics lockup never wait on a query. Visible "Loading…"
 * copy is omitted: the shimmer is the state.
 *
 * Unified Prep v2 (2b) made the list and the room ONE screen, so both routes
 * load into this same shape — the room no longer has a skeleton of its own
 * geometry to drift from.
 */

const STEPS = ["Evidence", "Skill level", "Rehearsal", "Day-of brief"]

function RoomRowSkeleton() {
  return (
    <div className="prp-lroom">
      <span className="prp-lroom-top">
        <Skeleton style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
        <span className="prp-lroom-main">
          <Skeleton style={{ width: "72%", height: 13, borderRadius: 4 }} />
          <Skeleton style={{ width: 128, height: 11, borderRadius: 4, marginTop: 5 }} />
        </span>
        <Skeleton style={{ width: 30, height: 12, borderRadius: 4, flexShrink: 0 }} />
      </span>
      <span className="prp-lroom-pips" aria-hidden>
        {STEPS.map((label) => <span key={label} data-state={0} />)}
      </span>
    </div>
  )
}

function SkillPathSkeleton() {
  return (
    <section className="prp-stand">
      <header className="prp-sk-head">
        <div className="prp-sk-lead">
          <p className="prp-sk-kicker">Skill path</p>
          <Skeleton style={{ width: "70%", height: 18, borderRadius: 4, marginTop: 6 }} />
        </div>
        <span className="prp-sk-radar" style={{ display: "grid", placeItems: "center" }}>
          <Skeleton style={{ width: 112, height: 112, borderRadius: "50%" }} />
        </span>
      </header>
      <div className="prp-sk-list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="prp-sk-row">
            <div className="prp-sk-copy">
              <Skeleton style={{ width: "58%", height: 14, borderRadius: 4 }} />
              <Skeleton style={{ width: 120, height: 10, borderRadius: 4, marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Three cards, matching the live block — not eleven. */
function TrainingSkeleton() {
  return (
    <section className="prp-stand prp-train">
      <header className="prp-train-lockup">
        <Skeleton style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }} />
        <Skeleton style={{ width: 156, height: 13, borderRadius: 4 }} />
      </header>
      <div className="prp-courses">
        {[0, 1, 2].map((i) => (
          <div key={i} className="prp-course">
            <div className="prp-course-head">
              <Skeleton style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0 }} />
              <Skeleton style={{ flex: 1, minWidth: 0, height: 14, borderRadius: 4 }} />
            </div>
            <Skeleton style={{ width: "85%", height: 11, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function PrepSkeleton() {
  return (
    <div
      className="tm-intel-page prp-workspace-page tm-page-enter"
      role="status"
      aria-busy="true"
      aria-label="Loading preparations"
    >
      <div className="mc-workspace">
        <aside className="mc-ws-rail prp-rail">
          <div className="mc-rail">
            <div className="prp-rail-head">
              <div className="prp-rail-title"><h1>Prep</h1></div>
              <div className="prp-legend" aria-hidden="true">
                {STEPS.map((label) => (
                  <span className="prp-legend-col" key={label}>
                    <span className="prp-legend-label">{label}</span>
                    <span className="prp-legend-bar" />
                  </span>
                ))}
              </div>
            </div>
            <div className="prp-lrooms" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <RoomRowSkeleton key={i} />)}
            </div>
            <TrainingSkeleton />
            <SkillPathSkeleton />
          </div>
        </aside>
        <div className="mc-ws-main" aria-hidden="true">
          <div className="prp-room">
            <div className="prp-room-head">
              <Skeleton style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }} />
              <div className="prp-room-title">
                <Skeleton style={{ width: "70%", height: 22, borderRadius: 6 }} />
                <Skeleton style={{ width: 220, height: 13, borderRadius: 4, marginTop: 6 }} />
              </div>
              <Skeleton style={{ width: 96, height: 30, borderRadius: 999, flexShrink: 0 }} />
            </div>
            <Skeleton style={{ height: 116, borderRadius: 10, marginTop: 18 }} />
            <div className="prp-steps">
              {STEPS.map((label) => (
                <Skeleton key={label} style={{ height: 78, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The room route loads the same screen — one shape, no second geometry. */
export const PrepRoomSkeleton = PrepSkeleton
