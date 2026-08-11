import { Skeleton } from "@/components/ui/skeleton"

export function CVBaselineSkeleton() {
  return (
    <div className="tm-page-canvas" style={{
      minHeight: "100dvh",
      padding: "24px 32px 48px",
    }}>
      {/* Page head */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton style={{ width: 140, height: 11, borderRadius: 4 }} />
          <Skeleton style={{ width: 200, height: 26, borderRadius: 6, marginTop: 2 }} />
          <Skeleton style={{ width: 300, height: 13, borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Skeleton style={{ width: 134, height: 36, borderRadius: 8 }} />
          <Skeleton style={{ width: 146, height: 36, borderRadius: 8 }} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            background: "var(--tm-surface)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: 14,
          }}>
            <Skeleton style={{ width: 40, height: 28, borderRadius: 4, marginBottom: 8 }} />
            <Skeleton style={{ width: 60, height: 11, borderRadius: 3, marginBottom: 6 }} />
            <Skeleton style={{ width: 90, height: 10, borderRadius: 3 }} />
          </div>
        ))}
      </div>

      {/* Two-col graph+jobs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(420px, 0.85fr) 1.15fr",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 16,
        background: "var(--tm-surface)",
        overflow: "hidden",
        minHeight: 620,
      }}>
        {/* Left: commit graph */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(255,255,255,0.01)",
          }}>
            <Skeleton style={{ width: 100, height: 11, borderRadius: 4 }} />
            <Skeleton style={{ width: 48, height: 10, borderRadius: 3 }} />
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr auto",
              alignItems: "center",
              padding: "10px 14px",
              gap: 10,
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Skeleton style={{ width: 10, height: 10, borderRadius: "50%" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton style={{ width: i % 3 === 0 ? 80 : 130, height: 12, borderRadius: 4 }} />
                <Skeleton style={{ width: 170, height: 10, borderRadius: 3 }} />
              </div>
              <Skeleton style={{ width: 36, height: 10, borderRadius: 3 }} />
            </div>
          ))}
        </div>

        {/* Right: target jobs */}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton style={{ width: 140, height: 11, borderRadius: 4 }} />
            <Skeleton style={{ width: 44, height: 10, borderRadius: 3 }} />
          </div>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              background: "var(--tm-surface)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 10,
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton style={{ width: 100, height: 13, borderRadius: 4 }} />
                <Skeleton style={{ width: 160, height: 11, borderRadius: 3 }} />
                <Skeleton style={{ width: 80, height: 10, borderRadius: 3 }} />
              </div>
              <Skeleton style={{ width: 60, height: 24, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
