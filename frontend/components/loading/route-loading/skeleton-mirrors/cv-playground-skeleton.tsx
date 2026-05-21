import { Skeleton } from "@/components/ui/skeleton"

export function CVPlaygroundSkeleton() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--tm-bg)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Page head */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Skeleton style={{ width: 64, height: 24, borderRadius: 6 }} />
              <Skeleton style={{ width: 10, height: 11, borderRadius: 2 }} />
              <Skeleton style={{ width: 80, height: 11, borderRadius: 4 }} />
              <Skeleton style={{ width: 10, height: 11, borderRadius: 2 }} />
              <Skeleton style={{ width: 140, height: 11, borderRadius: 4 }} />
            </div>
            <Skeleton style={{ width: 230, height: 26, borderRadius: 6 }} />
            <Skeleton style={{ width: 280, height: 13, borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[72, 80, 90, 110].map((w, i) => (
              <Skeleton key={i} style={{ width: w, height: 32, borderRadius: 6 }} />
            ))}
          </div>
        </div>
      </div>

      {/* Version tabs */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: "var(--tm-bg)",
        overflow: "hidden",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            minWidth: 220,
            padding: "10px 20px 9px",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <Skeleton style={{ width: 110, height: 12, borderRadius: 4 }} />
            <Skeleton style={{ width: 170, height: 10, borderRadius: 3 }} />
          </div>
        ))}
      </div>

      {/* Two-pane body */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      }}>
        {/* Edit pane */}
        <div style={{
          padding: "18px 24px 24px",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton style={{ width: 130, height: 11, borderRadius: 4 }} />
            <Skeleton style={{ width: 70, height: 11, borderRadius: 4 }} />
          </div>
          <div style={{
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 10,
            overflow: "hidden",
          }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "16px 1fr",
                gap: 12,
                padding: "10px 12px",
                borderBottom: "1px dashed rgba(255,255,255,0.04)",
                alignItems: "start",
              }}>
                <Skeleton style={{ width: 16, height: 16, borderRadius: 4, marginTop: 2 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <Skeleton style={{ width: "100%", height: 13, borderRadius: 4 }} />
                  <Skeleton style={{ width: `${55 + i * 9}%`, height: 13, borderRadius: 4 }} />
                  <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                    <Skeleton style={{ width: 58, height: 18, borderRadius: 99 }} />
                    <Skeleton style={{ width: 72, height: 18, borderRadius: 99 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview pane */}
        <div style={{
          padding: "18px 24px 24px",
          background: "var(--tm-bg)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          {/* Intel strip */}
          <Skeleton style={{ height: 62, borderRadius: 8 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton style={{ width: 100, height: 11, borderRadius: 4 }} />
            <Skeleton style={{ width: 80, height: 10, borderRadius: 3 }} />
          </div>
          {/* Preview box */}
          <div style={{
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 8,
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flex: 1,
          }}>
            <Skeleton style={{ width: 160, height: 16, borderRadius: 4 }} />
            <Skeleton style={{ width: 210, height: 11, borderRadius: 3 }} />
            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />
            {[100, 82, 92, 68, 96, 77, 60, 88, 74, 85].map((w, i) => (
              <Skeleton key={i} style={{ width: `${w}%`, height: 12, borderRadius: 3 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
