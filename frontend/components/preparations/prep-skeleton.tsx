import { Skeleton } from "@/components/ui/skeleton"
import { FINLATICS_PROGRAMS } from "@/lib/finlatics-programs"
import "@/app/(authed)/home/mission-control.css"
import "./preparations.css"
import "./skill-path-rail.css"
import "./training-card.css"

/**
 * Layout-matched loading for /preparations. Uses the live workspace classes
 * (tm-intel-page · mc-workspace · prp-row · prp-stand) so the swap to
 * content does not move the page. Title and rail labels stay — they never
 * wait on the applications query. Visible "Loading…" copy is omitted: the
 * shimmer is the state.
 */

function RowSkeleton() {
  return (
    <div className="prp-row">
      <Skeleton style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
      <div className="prp-row-main">
        <Skeleton style={{ width: "72%", height: 15, borderRadius: 4 }} />
        <Skeleton style={{ width: 148, height: 12, borderRadius: 4, marginTop: 6 }} />
      </div>
      <Skeleton style={{ width: 72, height: 12, borderRadius: 4, flexShrink: 0 }} />
    </div>
  )
}

function GroupSkeleton({ rows }: { rows: number }) {
  return (
    <div className="prp-group">
      <div className="prp-group-head">
        <Skeleton style={{ width: 88, height: 10, borderRadius: 4 }} />
        <span className="prp-group-line" />
      </div>
      {Array.from({ length: rows }, (_, i) => <RowSkeleton key={i} />)}
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

function TrainingSkeleton() {
  return (
    <section className="prp-stand">
      <header className="prp-train-lockup">
        <Skeleton style={{ width: 26, height: 26, borderRadius: 4, flexShrink: 0 }} />
        <Skeleton style={{ width: 168, height: 13, borderRadius: 4 }} />
      </header>
      <div className="prp-courses">
        {FINLATICS_PROGRAMS.map((program) => (
          <div key={program.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Skeleton style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
            <Skeleton style={{ flex: 1, minWidth: 0, height: 16, borderRadius: 4 }} />
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
      <div className="prp-head">
        <h1 className="prp-title">Preparations</h1>
      </div>
      <div className="mc-workspace">
        <aside className="mc-ws-rail">
          <div className="mc-rail" aria-hidden="true">
            <SkillPathSkeleton />
            <TrainingSkeleton />
          </div>
        </aside>
        <div className="mc-ws-main" aria-hidden="true">
          <GroupSkeleton rows={3} />
          <GroupSkeleton rows={2} />
        </div>
      </div>
    </div>
  )
}

export function PrepRoomSkeleton() {
  return (
    <div
      className="prp-page tm-page-enter"
      role="status"
      aria-busy="true"
      aria-label="Loading this prep room"
    >
      <Skeleton style={{ width: 110, height: 12, borderRadius: 4 }} />
      <div className="prp-room-head" style={{ marginTop: 10 }} aria-hidden="true">
        <Skeleton style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
        <div className="prp-room-title">
          <Skeleton style={{ width: "70%", height: 22, borderRadius: 6 }} />
          <Skeleton style={{ width: 140, height: 13, borderRadius: 4, marginTop: 6 }} />
        </div>
        <Skeleton style={{ width: 96, height: 28, borderRadius: 999, flexShrink: 0 }} />
      </div>
      {[0, 1].map((i) => (
        <section key={i} className="prp-sec" aria-hidden="true">
          <div className="prp-sec-head">
            <Skeleton style={{ width: 148, height: 11, borderRadius: 4 }} />
          </div>
          <Skeleton style={{ height: 132, borderRadius: 12, marginTop: 12 }} />
        </section>
      ))}
    </div>
  )
}
