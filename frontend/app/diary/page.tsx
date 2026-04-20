"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { diary, scores } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

// ── Types ─────────────────────────────────────────────────────

interface SkillDelta { taxonomy_key: string; xp_added: number }
interface DiaryEntry {
  id: string; log_date: string; entry_text: string
  score_before: number | null; score_after: number | null
  skills_delta: SkillDelta[]
}

// ── Helpers ───────────────────────────────────────────────────

function buildSkillPrompt(skills: string[]): string {
  if (skills.length === 0) return ""
  return `I want to focus on developing these skills: ${skills.join(", ")}.\n\n`
}

function computeStreak(entries: DiaryEntry[]): number {
  const dates = new Set(entries.map((e) => e.log_date))
  let streak = 0
  const d = new Date()
  while (true) {
    const key = d.toISOString().slice(0, 10)
    if (!dates.has(key)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function computeTotalXP(entries: DiaryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.skills_delta.reduce((s, d) => s + d.xp_added, 0), 0)
}

// ── Deep Focus Timer ──────────────────────────────────────────

const DURATIONS = [
  { label: "25 min", seconds: 25 * 60 },
  { label: "40 min", seconds: 40 * 60 },
  { label: "60 min", seconds: 60 * 60 },
]
const CIRC = 2 * Math.PI * 44 // r=44 in viewBox 100

function DeepFocusTimer({ todayTask }: { todayTask: string }) {
  const [durIdx, setDurIdx] = useState(0)
  const [remaining, setRemaining] = useState(DURATIONS[0].seconds)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [sessions, setSessions] = useState(0)

  const duration = DURATIONS[durIdx].seconds
  const progress = remaining / duration
  const dashArray = `${CIRC * progress} ${CIRC}`

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id)
          setRunning(false)
          setDone(true)
          setSessions((s) => s + 1)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  function selectDur(idx: number) {
    if (running) return
    setDurIdx(idx)
    setRemaining(DURATIONS[idx].seconds)
    setDone(false)
  }

  function reset() {
    setRunning(false)
    setRemaining(DURATIONS[durIdx].seconds)
    setDone(false)
  }

  const mins = String(Math.floor(remaining / 60)).padStart(2, "0")
  const secs = String(remaining % 60).padStart(2, "0")

  return (
    <div className="tm-card" style={{ backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="tm-label-caps" style={{ marginBottom: 6 }}>Deep Focus</div>
        {todayTask && (
          <div style={{
            padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
            fontSize: "var(--tm-fs-meta)", color: "var(--tm-text)",
          }}>
            <span style={{ color: "var(--tm-text-faint)" }}>Today · </span>{todayTask}
          </div>
        )}
      </div>

      {/* Timer ring */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 164, height: 164 }}>
          <svg width={164} height={164} viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
            {/* Track */}
            <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-border-soft)" strokeWidth={2} />
            {/* Inactive fill (shows remaining time in muted wash) */}
            <circle
              cx={50} cy={50} r={44} fill="none"
              stroke="var(--tm-accent-wash)" strokeWidth={6}
              strokeDasharray={`${CIRC} ${CIRC}`}
            />
            {/* Progress arc */}
            <circle
              cx={50} cy={50} r={44} fill="none"
              stroke="var(--tm-accent)" strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={dashArray}
              style={{
                transition: running ? "stroke-dasharray 1s linear" : "stroke-dasharray 0.4s var(--tm-ease)",
                filter: running ? "drop-shadow(0 0 8px var(--tm-accent-glow))" : "drop-shadow(0 0 4px var(--tm-accent-glow))",
              }}
            />
          </svg>

          {/* Center content */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <span style={{
              fontFamily: "var(--tm-font-mono)",
              fontSize: done ? 28 : 34,
              fontWeight: 300,
              color: done ? "var(--tm-success)" : "var(--tm-text)",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}>
              {done ? "✓" : `${mins}:${secs}`}
            </span>
            <span className="tm-label-caps" style={{ fontSize: 8 }}>
              {done ? "Complete" : running ? "Deep Work" : "Ready"}
            </span>
          </div>
        </div>
      </div>

      {/* Duration selector */}
      <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
        {DURATIONS.map((d, i) => (
          <button
            key={d.label}
            onClick={() => selectDur(i)}
            disabled={running}
            style={{
              padding: "4px 12px", borderRadius: "var(--tm-radius-pill)",
              fontSize: "var(--tm-fs-meta)", fontWeight: 500,
              background: i === durIdx ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${i === durIdx ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
              color: i === durIdx ? "var(--tm-accent)" : "var(--tm-text-faint)",
              cursor: running ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "all var(--tm-dur) var(--tm-ease)",
              opacity: running && i !== durIdx ? 0.4 : 1,
            }}
          >{d.label}</button>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setRunning((r) => !r)}
          disabled={done}
          className="tm-btn tm-btn-primary"
          style={{ flex: 1, justifyContent: "center", opacity: done ? 0.5 : 1 }}
        >
          {running ? "⏸ Pause" : done ? "✓ Done" : "▶ Start"}
        </button>
        <button
          onClick={reset}
          className="tm-btn tm-btn-ghost"
          style={{ fontSize: "var(--tm-fs-meta)" }}
        >
          ↺
        </button>
      </div>

      {/* Session dots */}
      <div>
        <div className="tm-meta" style={{ marginBottom: 8 }}>Today&apos;s sessions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {Array.from({ length: Math.max(5, sessions + 1) }).map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: i < sessions ? "var(--tm-accent)" : "var(--tm-border-soft)",
              boxShadow: i < sessions ? "0 0 5px var(--tm-accent-glow)" : "none",
              transition: "all var(--tm-dur) var(--tm-ease)",
            }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
          {sessions === 0 ? "No sessions yet — start your first" : `${sessions} session${sessions !== 1 ? "s" : ""} completed`}
        </div>
      </div>
    </div>
  )
}

// ── Milestone Ring ─────────────────────────────────────────────

function MilestoneRing({ done, icon, label }: { done: boolean; icon: string; label: string }) {
  const r = 22
  const circ = 2 * Math.PI * r

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "12px 8px", borderRadius: "var(--tm-radius-sm)",
      background: done ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${done ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
      opacity: done ? 1 : 0.5,
      transition: "all var(--tm-dur) var(--tm-ease)",
    }}>
      <div style={{ position: "relative", width: 50, height: 50 }}>
        <svg width={50} height={50} viewBox="0 0 56 56" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={28} cy={28} r={r} fill="none" stroke="var(--tm-border-soft)" strokeWidth={3} />
          <circle
            cx={28} cy={28} r={r} fill="none"
            stroke={done ? "var(--tm-accent)" : "var(--tm-border)"}
            strokeWidth={3}
            strokeDasharray={circ}
            strokeDashoffset={done ? 0 : circ}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.9s var(--tm-ease)",
              filter: done ? "drop-shadow(0 0 4px var(--tm-accent-glow))" : "none",
            }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17,
          color: done ? "var(--tm-accent)" : "var(--tm-text-faint)",
          filter: done ? "drop-shadow(0 0 5px var(--tm-accent-glow))" : "none",
        }}>
          {done ? icon : "○"}
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: done ? "var(--tm-text)" : "var(--tm-text-faint)", textAlign: "center", lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 9, color: done ? "var(--tm-accent)" : "var(--tm-text-faint)" }}>{done ? "✓" : "Locked"}</div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

function DiaryPageInner() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [entryText, setEntryText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [promptSkills, setPromptSkills] = useState<string[]>([])

  useEffect(() => {
    const raw = searchParams.get("skills")
    if (!raw) return
    const skills = raw.split(",").map((s) => s.trim()).filter(Boolean)
    if (skills.length === 0) return
    setPromptSkills(skills)
    setEntryText(buildSkillPrompt(skills))
  }, [searchParams])

  const historyQuery = useQuery({
    queryKey: ["diary", token],
    queryFn: () => diary.history(token!),
    enabled: !!token,
  })

  const scoresQuery = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const saveEntry = useMutation({
    mutationFn: () => diary.createEntry(token!, entryText),
    onMutate: () => setError(null),
    onSuccess: () => {
      setEntryText("")
      setPromptSkills([])
      queryClient.invalidateQueries({ queryKey: ["diary", token] })
      queryClient.invalidateQueries({ queryKey: ["scores", token] })
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save entry"),
  })

  if (!ready) return null

  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreak(entries)
  const totalXP = computeTotalXP(entries)
  const truthScore = scoresQuery.data?.total_score ?? 0
  const gapSkills = scoresQuery.data?.gap_skills ?? []

  const ACHIEVEMENTS = [
    { label: "CV Analysed",    done: entries.length > 0 || !!scoresQuery.data, icon: "◈" },
    { label: "Score Computed", done: !!scoresQuery.data,                        icon: "◉" },
    { label: "First Entry",    done: entries.length >= 1,                       icon: "▣" },
    { label: "5-Day Streak",   done: streak >= 5,                               icon: "◆" },
    { label: "Gap Closed",     done: false,                                     icon: "◑" },
    { label: "Score 80+",      done: truthScore >= 80,                          icon: "▲" },
  ]

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const weekPlan = weekDays.map((day, i) => ({
    day,
    task: gapSkills[i]?.skill
      ? `Practice ${gapSkills[i].skill}`
      : i === 6 ? "Rest & reflect" : "Log your progress",
    done: i < streak,
  }))

  // Today index (0=Mon … 6=Sun)
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
  const todayTask = weekPlan[todayIdx]?.task ?? "Log your progress"

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ── Stats ribbon ─────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          background: "linear-gradient(135deg, var(--tm-accent-wash), var(--tm-surface))",
          borderBottom: "1px solid var(--tm-border-soft)",
          padding: "14px 32px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div className="tm-label-caps">Diary & Achievements</div>
            {streak >= 3 && (
              <span className="tm-pill tm-pill-warning">🔥 {streak}-day streak</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            {[
              { label: "Streak",      value: streak,                unit: "d"    },
              { label: "Entries",     value: entries.length,        unit: ""     },
              { label: "Total XP",    value: totalXP,               unit: ""     },
              { label: "Truth Score", value: Math.round(truthScore), unit: "/100" },
            ].map(({ label, value, unit }, idx) => (
              <div key={label} style={{
                flex: 1, padding: "6px 20px",
                borderRight: idx < 3 ? "1px solid var(--tm-border-soft)" : "none",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <div style={{
                  fontFamily: "var(--tm-font-mono)",
                  fontSize: 26, fontWeight: 700,
                  color: "var(--tm-text)", lineHeight: 1,
                }}>
                  {value}{unit}
                </div>
                <div className="tm-label-caps">{label}</div>
              </div>
            ))}
            <div style={{ flex: 2, padding: "6px 20px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
              <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.min(100, truthScore)}%`,
                  background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-pressed))",
                  borderRadius: 999, transition: "width 1.2s var(--tm-ease)",
                }} />
              </div>
              <div className="tm-meta">
                {truthScore < 50
                  ? "Keep going — every entry counts"
                  : truthScore < 80
                  ? "Strong progress — closing the gap"
                  : "Excellent — top market position"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 32px 32px" }}>

          {/* Two-panel row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.45fr", gap: 16, marginBottom: 16 }}>

            {/* LEFT — Deep Focus Timer */}
            <DeepFocusTimer todayTask={todayTask} />

            {/* RIGHT — 7-Day Milestone Plan */}
            <div className="tm-card" style={{ backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="tm-label-caps">7-Day Milestone Plan</div>

              {/* Week plan rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {weekPlan.map(({ day, task, done }, i) => {
                  const isToday = i === todayIdx
                  return (
                    <div key={day} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                      background: done
                        ? "var(--tm-accent-wash)"
                        : isToday ? "var(--tm-surface-2)" : "rgba(255,255,255,0.02)",
                      border: done
                        ? "1px solid var(--tm-accent-ring)"
                        : isToday ? "1px solid var(--tm-border)" : "1px solid var(--tm-border-soft)",
                    }}>
                      {/* Day label */}
                      <div style={{
                        width: 30, fontSize: 10, fontWeight: 700,
                        color: done ? "var(--tm-accent)" : isToday ? "var(--tm-text)" : "var(--tm-text-faint)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}>{day}</div>

                      {/* Status dot */}
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                        border: `1.5px solid ${done ? "var(--tm-accent)" : isToday ? "var(--tm-text-muted)" : "var(--tm-border)"}`,
                        background: done ? "var(--tm-accent-wash)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 8,
                        color: done ? "var(--tm-accent)" : isToday ? "var(--tm-text-muted)" : "transparent",
                      }}>
                        {done ? "✓" : isToday ? "▸" : ""}
                      </div>

                      {/* Task */}
                      <span style={{
                        flex: 1, fontSize: 12,
                        color: done ? "var(--tm-text-faint)" : isToday ? "var(--tm-text)" : "var(--tm-text-faint)",
                        textDecoration: done ? "line-through" : "none",
                      }}>{task}</span>

                      {isToday && !done && (
                        <span className="tm-label-caps" style={{ fontSize: 8, color: "var(--tm-accent)" }}>TODAY</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "var(--tm-border-soft)" }} />

              {/* Achievements */}
              <div>
                <div className="tm-label-caps" style={{ marginBottom: 10 }}>Achievements</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {ACHIEVEMENTS.map((a) => (
                    <MilestoneRing key={a.label} done={a.done} icon={a.icon} label={a.label} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Learning Diary ──────────────────────────────────── */}
          <div className="tm-card" style={{ backdropFilter: "blur(20px)" }}>
            <div className="tm-label-caps" style={{ marginBottom: 16 }}>Learning Diary</div>

            {promptSkills.length > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)" }}>
                <div className="tm-label-caps" style={{ marginBottom: 6, color: "var(--tm-accent)" }}>Skills tagged from Intel</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {promptSkills.map((skill) => (
                    <span key={skill} className="tm-pill" style={{ background: "var(--tm-accent-wash)", color: "var(--tm-accent)", border: "1px solid var(--tm-accent-ring)" }}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <textarea
                value={entryText}
                onChange={(e) => setEntryText(e.target.value)}
                placeholder="What did you learn today? Any blockers? How are you feeling about the journey?"
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent)" }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
                style={{
                  flex: 1, padding: "12px 14px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: "var(--tm-surface-2)",
                  border: "1px solid var(--tm-border)",
                  color: "var(--tm-text)", fontSize: "var(--tm-fs-meta)", lineHeight: 1.6,
                  resize: "none" as const, minHeight: 72, fontFamily: "inherit", outline: "none",
                  transition: "border-color var(--tm-dur) var(--tm-ease)",
                }}
              />
              <button
                onClick={() => saveEntry.mutate()}
                disabled={!entryText.trim() || saveEntry.isPending}
                className="tm-btn tm-btn-primary"
                style={{ alignSelf: "flex-end", whiteSpace: "nowrap", opacity: !entryText.trim() ? 0.4 : 1 }}
              >
                {saveEntry.isPending ? "…" : "Add entry"}
              </button>
            </div>

            {error && (
              <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)", marginBottom: 12 }}>{error}</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {historyQuery.isLoading ? (
                <div style={{ height: 80, borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }} />
              ) : entries.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>
                  No entries yet. Write your first diary entry above.
                </div>
              ) : (
                entries.map((item) => (
                  <div key={item.id} style={{ padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.06em" }}>{item.log_date}</span>
                      {item.score_after != null && (
                        <span style={{ fontSize: 10, color: "var(--tm-accent)", marginLeft: "auto" }}>
                          Score: {item.score_before ?? "new"} → {item.score_after}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{item.entry_text}</p>
                    {item.skills_delta.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {item.skills_delta.map((sd) => (
                          <span
                            key={`${item.id}-${sd.taxonomy_key}`}
                            className="tm-pill"
                            style={{ background: "var(--tm-accent-wash)", color: "var(--tm-accent)", border: "1px solid var(--tm-accent-ring)" }}
                          >
                            {sd.taxonomy_key} +{sd.xp_added} XP
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default function DiaryPage() {
  return (
    <Suspense>
      <DiaryPageInner />
    </Suspense>
  )
}
