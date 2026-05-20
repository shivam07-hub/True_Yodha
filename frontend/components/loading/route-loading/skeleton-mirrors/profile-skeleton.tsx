import { Skeleton } from "@/components/ui/skeleton"

export function ProfileSkeleton() {
  return (
    <main
      aria-hidden="true"
      style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px", color: "var(--tm-text)" }}
    >
      {/* Eyebrow label */}
      <Skeleton style={{ width: 140, height: 11, borderRadius: 4, marginBottom: 8 }} />
      {/* Name / title */}
      <Skeleton style={{ width: 220, height: 28, borderRadius: 8, marginBottom: 28 }} />
      {/* Two-column card grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
        <Skeleton
          style={{
            height: 380,
            borderRadius: 16,
            border: "1px solid var(--tm-border)",
          }}
        />
        <Skeleton
          style={{
            height: 380,
            borderRadius: 16,
            border: "1px solid var(--tm-border)",
          }}
        />
      </div>
    </main>
  )
}
