import type { GapSkill } from "@/lib/api"

interface Props {
  skill: GapSkill
  rank: number
}

function gapColor(gapScore: number): string {
  if (gapScore >= 70) return "var(--tm-danger)"
  if (gapScore >= 40) return "var(--tm-warning)"
  return "var(--tm-accent)"
}

export function SkillUpgradeCard({ skill, rank }: Props) {
  const score = Math.round(skill.gap_score)
  const dashArray = `${score}, 100`
  const color = gapColor(score)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        borderRadius: "var(--tm-radius)",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--tm-border-soft)",
        padding: "var(--tm-card-pad)",
        transition: "all var(--tm-dur) var(--tm-ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
        e.currentTarget.style.background = "var(--tm-accent-wash)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-border-soft)"
        e.currentTarget.style.background = "rgba(255,255,255,0.02)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: "var(--tm-font-mono)",
            fontSize: "var(--tm-fs-display)",
            fontWeight: 300,
            color: "var(--tm-text-faint)",
            width: 40,
            textAlign: "center",
            flexShrink: 0,
            lineHeight: 1,
            transition: "color var(--tm-dur) var(--tm-ease)",
          }}>
            {rank}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 500, color: "var(--tm-text)", lineHeight: "var(--tm-lh-heading)" }}>
              {skill.skill}
            </div>
            <div style={{ marginTop: 2, fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", letterSpacing: "var(--tm-tracking-meta)" }}>
              L{skill.current_level} → L{skill.target_level} · Scout benchmark
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 500, color: "var(--tm-text)" }}>
              {skill.job_count_30d.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "var(--tm-tracking-caps)", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              jobs/30d
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }} viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--tm-border)"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={color}
                  strokeDasharray={dashArray}
                  strokeLinecap="round"
                  strokeWidth="3"
                />
              </svg>
              <span style={{ position: "absolute", fontSize: 12, fontWeight: 500, color: "var(--tm-text)" }}>{score}</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "var(--tm-tracking-caps)", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              Gap
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
