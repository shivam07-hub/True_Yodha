/**
 * CVWorkstationSkeleton — the ONE loading state on the way into the CV
 * workstation.
 *
 * There were four, in three different geometries, and none of them was the
 * shape of the screen being loaded:
 *   1 loading.tsx served CVPlaygroundSkeleton — two EQUAL panes and a row of
 *     version tabs, mirroring a layout that was replaced months ago (the real
 *     split is 1fr / 400px and has no version tabs). It also keyed only off
 *     `jobId`, so `/cv?edit=1` got the LIBRARY skeleton on the way to the
 *     workstation.
 *   2 page.tsx's `bootstrapping` gate served CvSkeleton — page head + one card.
 *   3 a `versionsLoading` branch served CvDocumentSkeleton — a 420/300 split.
 *   4 `view === "master-edit" && !cvData` rendered the whole LibraryView, a
 *     real screen flashing before the workstation mounted.
 *
 * A skeleton earns its place by holding the shape the content will take. Four
 * that disagree are worse than none: each hand-off is a visible relayout, and
 * the user reads relayout as "it broke and restarted". This mirrors the real
 * shell — 64px header, the EDIT/SHEET toolbar, the CV column, the 400px rail
 * with its triage tiles — so the mount is a fill, not a jump.
 */
import { Skeleton } from "@/components/ui/skeleton"

const RAIL_W = 400
const LINE_WIDTHS = ["96%", "88%", "72%", "94%", "63%", "90%", "78%"]

export function CVWorkstationSkeleton() {
  return (
    <div className="tm-page-canvas" aria-hidden="true"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* header — 64px, crumb · brand · job line · score · two actions */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, minHeight: 64,
        padding: "10px 20px", borderBottom: "1px solid var(--tm-border-soft)",
      }}>
        <Skeleton style={{ width: 30, height: 30, borderRadius: 8 }} />
        <Skeleton style={{ width: 110, height: 15, borderRadius: 4 }} />
        <Skeleton style={{ width: 180, height: 13, borderRadius: 4 }} />
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <Skeleton style={{ width: 96, height: 20, borderRadius: 4 }} />
          <Skeleton style={{ width: 150, height: 4, borderRadius: 2 }} />
        </div>
        <Skeleton style={{ width: 78, height: 38, borderRadius: 10 }} />
        <Skeleton style={{ width: 118, height: 38, borderRadius: 10 }} />
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${RAIL_W}px` }}>
        <section style={{ borderRight: "1px solid var(--tm-border-soft)" }}>
          {/* toolbar — EDIT / SHEET + the page-fill meter */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "10px 24px",
            borderBottom: "1px solid var(--tm-border-soft)",
          }}>
            <Skeleton style={{ width: 132, height: 32, borderRadius: 8 }} />
            <span style={{ flex: 1 }} />
            <Skeleton style={{ width: 210, height: 10, borderRadius: 3 }} />
            <Skeleton style={{ width: 90, height: 4, borderRadius: 2 }} />
          </div>

          <div style={{ padding: "24px 40px", maxWidth: 1080, margin: "0 auto" }}>
            {/* identity card */}
            <Card>
              <Skeleton style={{ width: 210, height: 22, borderRadius: 5 }} />
              <Skeleton style={{ width: 150, height: 13, borderRadius: 4, marginTop: 8 }} />
              <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
                <Skeleton style={{ width: 190, height: 12, borderRadius: 3 }} />
                <Skeleton style={{ width: 140, height: 12, borderRadius: 3 }} />
              </div>
            </Card>

            {[0, 1].map(block => (
              <div key={block}>
                <Skeleton style={{ width: 84, height: 10, borderRadius: 3, margin: "22px 2px 8px" }} />
                <Card pad={0}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--tm-border-soft)" }}>
                    <Skeleton style={{ width: 260, height: 14, borderRadius: 4 }} />
                  </div>
                  {LINE_WIDTHS.slice(block * 3, block * 3 + 3).map((w, i) => (
                    /* 3px gutter · the line · the verdict — the real row grid */
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "3px minmax(0, 1fr) auto",
                      columnGap: 16, padding: "14px 20px 14px 0",
                      borderBottom: "1px solid var(--tm-border-faint)",
                    }}>
                      <Skeleton style={{ width: 3, height: "100%", borderRadius: 0 }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <Skeleton style={{ width: "100%", height: 15, borderRadius: 4 }} />
                        <Skeleton style={{ width: w, height: 15, borderRadius: 4 }} />
                      </div>
                      <Skeleton style={{ width: 44, height: 10, borderRadius: 3 }} />
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        </section>

        <aside style={{ display: "flex", flexDirection: "column" }}>
          {/* rail toggle */}
          <div style={{
            display: "flex", gap: 8, padding: "12px 14px",
            borderBottom: "1px solid var(--tm-border-soft)",
          }}>
            <Skeleton style={{ flex: 1, height: 38, borderRadius: 8 }} />
            <Skeleton style={{ flex: 1, height: 38, borderRadius: 8 }} />
          </div>
          {/* triage numerals */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                padding: "16px 14px 14px",
                borderTop: "2px solid var(--tm-border)",
                borderRight: i < 2 ? "1px solid var(--tm-border-soft)" : undefined,
              }}>
                <Skeleton style={{ width: 26, height: 26, borderRadius: 4 }} />
                <Skeleton style={{ width: 62, height: 10, borderRadius: 3, marginTop: 8 }} />
              </div>
            ))}
          </div>
          {/* the queue */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "3px minmax(0, 1fr) auto",
                columnGap: 12, alignItems: "center",
                borderRadius: 8, background: "var(--tm-surface-2)", overflow: "hidden",
              }}>
                <Skeleton style={{ width: 3, height: "100%", borderRadius: 0 }} />
                <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton style={{ width: `${58 + i * 7}%`, height: 13, borderRadius: 4 }} />
                  <Skeleton style={{ width: 110, height: 9, borderRadius: 3 }} />
                </div>
                <Skeleton style={{ width: 10, height: 10, borderRadius: 3, marginRight: 14 }} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Card({ children, pad = 20 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div style={{
      background: "var(--tm-surface)",
      border: "1px solid var(--tm-border-soft)",
      borderRadius: 8,
      padding: pad,
      overflow: "hidden",
    }}>{children}</div>
  )
}
