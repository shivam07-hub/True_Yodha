"use client"


interface ForgeStripProps {
  streak: number
  sessions: number
  score: number
  evidenceData: { evidence_count: number; diary_entries_count: number; score_delta: number | null } | null
  onEnterForge: () => void
  onOpenDiary: () => void
  cartCount: number
}

export function ForgeStrip({ streak, sessions, score, evidenceData, onEnterForge, onOpenDiary, cartCount }: ForgeStripProps) {
  const sinceCvParts: string[] = []
  if (evidenceData) {
    if (evidenceData.score_delta != null) sinceCvParts.push(`+${Math.max(0, Math.round(evidenceData.score_delta))} score`)
    if (evidenceData.diary_entries_count) sinceCvParts.push(`${evidenceData.diary_entries_count} diary entries`)
    if (evidenceData.evidence_count) sinceCvParts.push(`${evidenceData.evidence_count} days`)
  }

  const stats = [
    { label: "STREAK", value: `${streak}`, unit: "d" },
    { label: "SESSIONS", value: `${sessions}`, unit: "" },
    { label: "SCORE", value: `${Math.round(score)}`, unit: "/100" },
  ]

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,245,212,0.04) 0%, var(--tm-surface) 60%)",
      border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)",
      padding: "14px 18px", display: "flex", alignItems: "center", gap: 0,
    }}>
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", gap: 0, minWidth: 0 }}>
        {stats.map(({ label, value, unit }, i) => (
          <div key={label} style={{
            flex: 1, paddingRight: i < stats.length - 1 ? 16 : 0,
            marginRight: i < stats.length - 1 ? 16 : 0,
            borderRight: i < stats.length - 1 ? "1px solid var(--tm-border-soft)" : "none",
          }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 22, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {value}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--tm-text-faint)", marginLeft: 1 }}>{unit}</span>
            </div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginTop: 3 }}>{label}</div>
            {label === "SCORE" && sinceCvParts.length > 0 && (
              <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Since last CV: {sinceCvParts.join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, marginLeft: 20, borderLeft: "1px solid var(--tm-border-soft)", paddingLeft: 20 }}>
        <button
          onClick={onEnterForge}
          style={{
            padding: "8px 18px", borderRadius: "var(--tm-radius-pill)",
            background: "var(--tm-accent)", border: "none",
            color: "var(--tm-accent-fg)", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
            whiteSpace: "nowrap", boxShadow: "0 0 12px rgba(0,245,212,0.25)",
          }}
        >
          Enter Forge ↗
        </button>
        <button
          onClick={onOpenDiary}
          style={{
            padding: "7px 18px", borderRadius: "var(--tm-radius-pill)",
            background: "transparent", border: "1px solid var(--tm-border)",
            color: "var(--tm-text-faint)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            transition: "border-color var(--tm-dur) var(--tm-ease)",
            display: "flex", alignItems: "center", gap: 7,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
        >
          Diary + cart
          {cartCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 18, height: 18, borderRadius: 99, padding: "0 5px",
              background: "var(--tm-accent)", color: "var(--tm-accent-fg)",
              fontSize: 10, fontWeight: 700, fontFamily: "var(--tm-font-mono)",
              animation: "pulseRing 2.4s ease infinite",
            }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
