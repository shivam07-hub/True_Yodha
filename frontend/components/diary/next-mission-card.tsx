"use client"

interface Mission {
  id: string
  title: string
  action: string
  proof_prompt?: string | null
  completed_at?: string | null
}

interface NextMissionCardProps {
  mission:       Mission | null
  jobTitle?:     string
  company?:      string
  readinessPct?: number
  isLogged:      boolean
  isCompleted:   boolean
  isDismissed:   boolean
  onLogProgress: () => void
  onComplete:    () => void
  onDismiss:     () => void
}

export function NextMissionCard({
  mission, jobTitle, company, readinessPct = 0,
  isLogged, isCompleted, isDismissed,
  onLogProgress, onComplete, onDismiss,
}: NextMissionCardProps) {

  if (!mission) return null

  if (isDismissed) return (
    <div style={{
      padding: "12px 16px", borderRadius: "var(--tm-radius)",
      border: "1px solid var(--tm-border-soft)",
      background: "rgba(255,255,255,0.02)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 16,
    }}>
      <span style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
        Mission paused for today.
      </span>
      <button
        onClick={onDismiss}
        style={{
          fontSize: 12, color: "var(--tm-accent)", background: "none",
          border: "none", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Show again
      </button>
    </div>
  )

  if (isCompleted) return (
    <div style={{
      background: "var(--tm-surface)", border: "1px solid var(--tm-success)",
      borderRadius: "var(--tm-radius-lg)", padding: "28px 20px",
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 12, textAlign: "center", marginBottom: 16,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, color: "var(--tm-success)",
        boxShadow: "0 0 20px rgba(74,222,128,0.25)",
      }}>✓</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>
          Mission complete.
        </div>
        <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
          Evidence saved to your CV profile.
        </div>
      </div>
    </div>
  )

  return (
    <div style={{
      borderRadius: "var(--tm-radius-lg)", overflow: "hidden",
      border: "1px solid var(--tm-accent-ring)",
      boxShadow: "0 0 40px rgba(0,245,212,0.08), var(--tm-shadow-2)",
      marginBottom: 16,
    }}>

      {/* Header wash */}
      <div style={{
        padding: "18px 18px 16px",
        background: "linear-gradient(135deg, rgba(0,245,212,0.12) 0%, rgba(0,245,212,0.04) 60%, transparent 100%)",
        borderBottom: "1px solid var(--tm-accent-ring)",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative ring */}
        <div aria-hidden style={{
          position: "absolute", top: -20, right: -20,
          width: 100, height: 100, borderRadius: "50%",
          border: "1px solid var(--tm-accent-ring)", opacity: 0.3,
          pointerEvents: "none",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--tm-accent)",
            boxShadow: "0 0 8px var(--tm-accent)",
            animation: "pulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--tm-accent)", fontWeight: 700,
          }}>Your move today</span>
          <span style={{
            marginLeft: "auto", fontSize: 11, padding: "2px 8px",
            borderRadius: "var(--tm-radius-pill)",
            background: "var(--tm-warning-wash)", color: "var(--tm-warning)",
            border: "1px solid var(--tm-warning)", fontWeight: 500,
          }}>Today</span>
        </div>

        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.4, marginBottom: 8 }}>
          {mission.action}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Skill:</span>
          <span style={{
            fontSize: 12, padding: "1px 8px", borderRadius: "var(--tm-radius-pill)",
            background: "var(--tm-accent-wash)", color: "var(--tm-accent)",
            border: "1px solid var(--tm-accent-ring)",
          }}>
            ◈ {mission.title}
          </span>
          <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>for</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--tm-text-muted)" }}>
            {jobTitle}{company ? ` @ ${company}` : ""}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px 16px", background: "var(--tm-surface)" }}>

        {/* Readiness bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{
              fontSize: 11, color: "var(--tm-text-faint)",
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>Readiness</span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-accent)" }}>
              {readinessPct}%
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${readinessPct}%`, borderRadius: 999,
              background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-pressed))",
              transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
            }} />
          </div>
        </div>

        {/* Primary CTA */}
        <button
          onClick={onLogProgress}
          disabled={isLogged}
          className="tm-btn"
          style={{
            width: "100%", justifyContent: "center", marginBottom: 8,
            padding: "13px 16px", height: "auto", fontSize: 15, fontWeight: 700,
            background: isLogged ? "var(--tm-success-wash)" : "var(--tm-accent)",
            border: isLogged ? "1px solid var(--tm-success)" : "none",
            color: isLogged ? "var(--tm-success)" : "var(--tm-accent-fg)",
            boxShadow: isLogged ? "none" : "var(--tm-shadow-glow)",
          }}
        >
          {isLogged ? "✓ Diary pre-filled below" : "▶  Log progress now"}
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onComplete}
            className="tm-btn tm-btn-ghost"
            style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
          >
            ✓ Mark complete
          </button>
          <button
            onClick={onDismiss}
            className="tm-btn tm-btn-subtle"
            style={{ fontSize: 13 }}
          >
            Not today
          </button>
        </div>
      </div>
    </div>
  )
}
