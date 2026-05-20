"use client"

/* Wave sparkline background for MissionHeader */
export function WaveBg({ score }: { score: number }) {
  const W = 1480
  const H = 400
  const history = [2, 3, 5, 4, 8, 11, 13, 18, Math.max(score, 2)]
  const max = 100
  const stepX = W / (history.length - 1)
  const pts = history.map((v, i): [number, number] => [
    i * stepX,
    H - (v / max) * (H - 40) - 16,
  ])
  const smooth = pts.map((p, i, arr) => {
    if (i === 0) return `M${p[0]},${p[1]}`
    const prev = arr[i - 1]
    const cx = (prev[0] + p[0]) / 2
    return `Q${cx},${prev[1]} ${cx},${(prev[1] + p[1]) / 2} T${p[0]},${p[1]}`
  }).join(" ")
  const fill = `${smooth} L${W},${H} L0,${H} Z`
  const last = pts[pts.length - 1]
  return (
    <svg
      width="100%" height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", position: "absolute", inset: 0 }}
    >
      <defs>
        <linearGradient id="mhWaveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="var(--tm-accent)" stopOpacity="0.18" />
          <stop offset="60%" stopColor="var(--tm-accent)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--tm-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#mhWaveFill)" />
      <path d={smooth} fill="none" stroke="var(--tm-accent)" strokeWidth="2"
        strokeLinecap="round" strokeOpacity="0.75" />
      <circle cx={last[0]} cy={last[1]} r="14" fill="var(--tm-accent)" opacity="0.15" />
      <circle cx={last[0]} cy={last[1]} r="6"  fill="var(--tm-accent)"
        style={{ filter: "drop-shadow(0 0 10px var(--tm-accent-glow))" }} />
    </svg>
  )
}

type Step = { id: string; label: string; xp?: number }
const STEPS: Step[] = [
  { id: "find-job", label: "Find job" },
  { id: "forge",    label: "Forge",    xp: 50 },
  { id: "log",      label: "Log" },
  { id: "level",    label: "Level up" },
  { id: "apply",    label: "Apply" },
]

function getNextId(hasCv: boolean, hasJob: boolean, loggedToday: boolean, hasApplied: boolean): string {
  if (!hasCv || !hasJob) return "find-job"
  if (!loggedToday) return "forge"
  if (loggedToday) return "log"
  if (!hasApplied) return "apply"
  return "level"
}

function getDoneIds(hasCv: boolean, hasJob: boolean, loggedToday: boolean): Set<string> {
  const done = new Set<string>()
  if (hasCv && hasJob) done.add("find-job")
  if (loggedToday) { done.add("forge"); done.add("log") }
  return done
}

/* Segmented pill step tracker */
export function SegmentedSteps({ hasCv, hasJob, loggedToday, hasApplied }: {
  hasCv: boolean; hasJob: boolean; loggedToday: boolean; hasApplied: boolean
}) {
  const nextId = getNextId(hasCv, hasJob, loggedToday, hasApplied)
  const doneIds = getDoneIds(hasCv, hasJob, loggedToday)
  return (
    <div
      role="list"
      aria-label="Mission progress"
      style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}
    >
      {STEPS.map((s, i) => {
        const done   = doneIds.has(s.id)
        const active = s.id === nextId
        return (
          <div
            key={s.id}
            role="listitem"
            aria-current={active ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            {i > 0 && <div style={{ width: 18, height: 1, background: "var(--tm-border-soft)", flexShrink: 0 }} />}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              minHeight: 28,
              color: active ? "var(--tm-accent)" : done ? "var(--tm-text-muted)" : "var(--tm-text-faint)",
              fontSize: 12, fontWeight: active ? 750 : 550,
              fontFamily: "var(--tm-font-mono)",
              letterSpacing: ".06em", textTransform: "uppercase" as const,
            }}>
              <span style={{
                width: active ? 16 : 12, height: active ? 16 : 12, borderRadius: 999, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: done ? "rgba(74,222,128,0.9)" : active ? "var(--tm-accent-wash)" : "transparent",
                border: active ? "1.5px solid var(--tm-accent-ring)" : done ? "none" : "1.5px solid var(--tm-border)",
                color: done ? "var(--tm-bg)" : "var(--tm-accent-fg)",
                fontSize: 8, fontWeight: 700,
                boxShadow: active ? "0 0 0 4px rgba(0,245,212,0.04)" : "none",
              }}>
                {done ? "✓" : ""}
              </span>
              <span style={{ textDecoration: done ? "line-through" : "none" }}>{s.label}</span>
              {active && s.xp && (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 20,
                  padding: "0 7px",
                  borderRadius: 999,
                  background: "var(--tm-accent-wash)",
                  border: "1px solid var(--tm-accent-ring)",
                  color: "var(--tm-accent)",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}>
                  +{s.xp}XP
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
