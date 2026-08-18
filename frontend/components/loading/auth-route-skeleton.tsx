import { Skeleton } from "@/components/ui/skeleton"

/**
 * Login/signup route shape while `useSearchParams` suspends. Mirrors
 * AuthPageShell's centred form card so the first paint matches the destination.
 */
export function AuthRouteSkeleton() {
  return (
    <main
      className="tm-page-canvas"
      aria-hidden="true"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 18px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <Skeleton style={{ width: 42, height: 42, borderRadius: 12 }} />
          <Skeleton style={{ width: 72, height: 24, borderRadius: 6 }} />
          <Skeleton style={{ width: 120, height: 11, borderRadius: 4 }} />
        </div>
        <div
          style={{
            border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-panel-radius-lg)",
            padding: 26,
            background: "var(--tm-surface)",
          }}
        >
          <Skeleton style={{ width: 168, height: 22, borderRadius: 6, marginBottom: 18 }} />
          <Skeleton style={{ width: "100%", height: 40, borderRadius: 8, marginBottom: 12 }} />
          <Skeleton style={{ width: "100%", height: 40, borderRadius: 8, marginBottom: 16 }} />
          <Skeleton style={{ width: "100%", height: 42, borderRadius: 10 }} />
        </div>
      </div>
    </main>
  )
}
