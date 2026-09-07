import { Skeleton } from "@/components/ui/skeleton"

/**
 * Mobile route skeletons. Each mirrors the live phone surface so the
 * loading.tsx / page-bootstrap / in-page feed wait are one shape, not a
 * desktop workspace that then relayouts into Jobs / Collections / CV.
 */

const PAGE: React.CSSProperties = {
  padding: "10px 16px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

function TitleRow({ pills }: { pills: number[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Skeleton style={{ width: 92, height: 26, borderRadius: 8 }} />
      <span style={{ flex: 1 }} />
      {pills.map((w) => (
        <Skeleton key={w} style={{ width: w, height: 32, borderRadius: 8, flexShrink: 0 }} />
      ))}
    </div>
  )
}

function CardBlock({ height, opacity = 1 }: { height: number; opacity?: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 16,
        border: "1px solid var(--tm-border-faint)",
        background: "var(--tm-surface)",
        padding: 14,
        opacity,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Skeleton style={{ width: 40, height: 40, borderRadius: 10 }} />
      <Skeleton style={{ width: "72%", height: 14, borderRadius: 4 }} />
      <Skeleton style={{ width: "48%", height: 11, borderRadius: 4 }} />
    </div>
  )
}

/** Three swipe-card placeholders — the Jobs feed wait. */
export function JobsMobileFeedRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <CardBlock key={i} height={128} opacity={1 - i * 0.18} />
      ))}
    </>
  )
}

/** Three collection-row placeholders — the Collections board wait. */
export function CollectionsMobileFeedRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <CardBlock key={i} height={86} opacity={1 - i * 0.18} />
      ))}
    </>
  )
}

export function JobsMobileSkeleton() {
  return (
    <div style={PAGE}>
      <TitleRow pills={[108, 32]} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Skeleton style={{ width: 148, height: 32, borderRadius: 9 }} />
        <Skeleton style={{ width: 88, height: 32, borderRadius: 8 }} />
        <span style={{ flex: 1 }} />
        <Skeleton style={{ width: 32, height: 32, borderRadius: 8 }} />
      </div>
      <JobsMobileFeedRows />
    </div>
  )
}

export function CollectionsMobileSkeleton() {
  return (
    <div style={PAGE}>
      <TitleRow pills={[72]} />
      <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
        {[64, 58, 72, 70].map((w) => (
          <Skeleton key={w} style={{ width: w, height: 28, borderRadius: 8, flexShrink: 0 }} />
        ))}
      </div>
      <CollectionsMobileFeedRows />
    </div>
  )
}

export function PracticeMobileSkeleton() {
  return (
    <div style={{ ...PAGE, gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Skeleton style={{ width: 160, height: 26, borderRadius: 8 }} />
        <Skeleton style={{ width: 110, height: 34, borderRadius: 10 }} />
      </div>
      <div style={{ display: "grid", placeItems: "center", padding: "12px 0 8px" }}>
        <Skeleton style={{ width: 180, height: 180, borderRadius: "50%" }} />
      </div>
      <Skeleton style={{ width: "70%", height: 16, borderRadius: 6, alignSelf: "center" }} />
      <Skeleton style={{ height: 110, borderRadius: 14, border: "1px solid var(--tm-border-soft)" }} />
      <Skeleton style={{ height: 110, borderRadius: 14, border: "1px solid var(--tm-border-soft)" }} />
    </div>
  )
}

export function ProfileMobileSkeleton() {
  return (
    <div style={PAGE}>
      <Skeleton style={{ width: 96, height: 26, borderRadius: 8 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: 14,
          borderRadius: 16,
          border: "1px solid var(--tm-border-faint)",
          background: "var(--tm-surface)",
        }}
      >
        <Skeleton style={{ width: 64, height: 64, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton style={{ width: "56%", height: 16, borderRadius: 4 }} />
          <Skeleton style={{ width: "40%", height: 12, borderRadius: 4 }} />
        </div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} style={{ height: 48, borderRadius: 12 }} />
      ))}
    </div>
  )
}

export function CVMobileHubSkeleton() {
  return (
    <div style={{ padding: "20px 16px 36px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Skeleton style={{ width: 96, height: 28, borderRadius: 8 }} />
        <Skeleton style={{ width: 44, height: 44, borderRadius: 10 }} />
      </div>
      <div
        style={{
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-lg, 14px)",
          background: "var(--tm-surface)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Skeleton style={{ width: 120, height: 16, borderRadius: 4 }} />
        <Skeleton style={{ width: "100%", height: 220, borderRadius: 8 }} />
        <Skeleton style={{ width: "100%", height: 44, borderRadius: 10 }} />
        <Skeleton style={{ width: "100%", height: 44, borderRadius: 10 }} />
      </div>
    </div>
  )
}

export function CVMobileWorkstationSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 64, padding: "10px 14px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <Skeleton style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />
        <Skeleton style={{ width: 140, height: 14, borderRadius: 4 }} />
        <span style={{ flex: 1 }} />
        <Skeleton style={{ width: 78, height: 38, borderRadius: 10 }} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--tm-border-soft)", overflow: "hidden" }}>
        {[72, 88, 64].map((w) => (
          <Skeleton key={w} style={{ width: w, height: 32, borderRadius: 8, flexShrink: 0 }} />
        ))}
      </div>
      <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton style={{ width: "70%", height: 20, borderRadius: 5 }} />
        <Skeleton style={{ width: "48%", height: 13, borderRadius: 4 }} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 52, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  )
}

export function IntelMobileSkeleton() {
  return (
    <div style={{ ...PAGE, padding: "18px 16px" }}>
      <Skeleton style={{ width: 88, height: 11, borderRadius: 4 }} />
      <Skeleton style={{ width: 200, height: 26, borderRadius: 8 }} />
      <Skeleton style={{ width: "80%", height: 13, borderRadius: 4 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Skeleton style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0 }} />
            <Skeleton style={{ flex: 1, height: 34, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function GenericMobileSkeleton() {
  return (
    <div style={PAGE}>
      <Skeleton style={{ width: 72, height: 11, borderRadius: 4 }} />
      <Skeleton style={{ width: 180, height: 26, borderRadius: 8 }} />
      <Skeleton style={{ height: 84, borderRadius: 14 }} />
      <Skeleton style={{ height: 132, borderRadius: 14 }} />
      <Skeleton style={{ height: 132, borderRadius: 14 }} />
    </div>
  )
}
