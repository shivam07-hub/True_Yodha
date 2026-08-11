import { Skeleton } from "@/components/ui/skeleton"

export function AppShellSkeleton() {
  return (
    <main
      aria-hidden="true"
      className="tm-page-canvas"
      style={{
        minHeight: "100dvh",
        width: "100vw",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        {/* Logo placeholder */}
        <Skeleton style={{ width: 74, height: 74, borderRadius: "50%" }} />
        {/* Title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Skeleton style={{ width: 80, height: 20, borderRadius: 6 }} />
          <Skeleton style={{ width: 120, height: 12, borderRadius: 4 }} />
        </div>
        {/* Stage indicator row */}
        <div style={{ display: "flex", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ width: 36, height: 36, borderRadius: "50%" }} />
          ))}
        </div>
        {/* Message line */}
        <Skeleton style={{ width: 180, height: 12, borderRadius: 4 }} />
        {/* Body skeleton lines */}
        <div style={{ width: "min(360px, calc(100vw - 64px))", display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton style={{ height: 8, width: "100%", borderRadius: 4 }} />
          <Skeleton style={{ height: 8, width: "75%", borderRadius: 4 }} />
        </div>
      </div>
    </main>
  )
}
