"use client"

type Tab = "active" | "verdicts"

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  activeCount: number
  verdictsCount: number
  pendingReviewCount: number
  onAddManually: () => void
}

export function TrackerHeader({ tab, onTab, activeCount, verdictsCount, pendingReviewCount, onAddManually }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap",
    }}>
      <div>
        <div style={{
          fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4,
        }}>
          Application tracker
        </div>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 600,
          fontFamily: "var(--tm-font-serif, inherit)",
          letterSpacing: "-0.02em", color: "var(--tm-text)",
        }}>
          Where everything is
        </h1>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{
          display: "flex", gap: 4,
          padding: 3, borderRadius: 99,
          background: "rgba(255,255,255,0.025)", border: "1px solid var(--tm-border)",
        }}>
          <TabPill label="Active" count={activeCount} active={tab === "active"} onClick={() => onTab("active")} />
          <TabPill
            label="Verdicts"
            count={verdictsCount}
            active={tab === "verdicts"}
            onClick={() => onTab("verdicts")}
            badge={pendingReviewCount}
          />
        </div>
        <button
          onClick={onAddManually}
          style={{
            padding: "8px 14px", borderRadius: 99,
            background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
            color: "var(--tm-interactive)", cursor: "pointer",
            fontSize: 12, fontFamily: "inherit", fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          + Add manually
        </button>
      </div>
    </div>
  )
}

function TabPill({
  label, count, active, onClick, badge,
}: { label: string; count: number; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 14px", borderRadius: 99,
        fontSize: 12, fontFamily: "inherit", cursor: "pointer",
        background: active ? "var(--tm-interactive)" : "transparent",
        border: "none",
        color: active ? "var(--tm-interactive-fg)" : "var(--tm-text-muted)",
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, opacity: 0.85 }}>{count}</span>
      {badge && badge > 0 && (
        <span style={{
          position: "absolute", top: -3, right: -3,
          width: 16, height: 16, borderRadius: 99,
          background: "var(--tm-danger)", color: "white",
          fontSize: 10, fontFamily: "var(--tm-font-mono)",
          display: "grid", placeItems: "center",
        }}>
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  )
}
