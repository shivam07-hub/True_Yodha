"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { diary, scores } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

function buildSkillPrompt(skills: string[]): string {
  if (skills.length === 0) return ""
  return `I want to focus on developing these skills: ${skills.join(", ")}.\n\n`
}

interface SkillDelta { taxonomy_key: string; xp_added: number }
interface DiaryEntry {
  id: string; log_date: string; entry_text: string
  score_before: number | null; score_after: number | null
  skills_delta: SkillDelta[]
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

  const ACHIEVEMENTS = [
    { label: "CV Analysed",       done: entries.length > 0 || !!scoresQuery.data,  icon: "◈", color: "#00F5D4" },
    { label: "Score Computed",    done: !!scoresQuery.data,                         icon: "◉", color: "#00F5D4" },
    { label: "First Diary Entry", done: entries.length >= 1,                        icon: "▣", color: "#00F5D4" },
    { label: "5-Day Streak",      done: streak >= 5,                               icon: "◆", color: "#A97FFF" },
    { label: "First Gap Closed",  done: false,                                     icon: "◑", color: "#A97FFF" },
    { label: "Truth Score 80+",   done: (scoresQuery.data?.total_score ?? 0) >= 80, icon: "▲", color: "#FFB347" },
  ]

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(0,245,212,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Diary & Achievements
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.02em", marginBottom: 4 }}>Progress</h1>
          <p style={{ fontSize: 13, color: "rgba(240,244,255,0.45)" }}>Your 7-day plan, diary and milestone tracker</p>
        </div>

        {/* Top: stats + milestones */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* Stats */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,245,212,0.1)", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 16 }}>
              Stats
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Streak", value: streak, unit: "d", color: "#FFB347" },
                { label: "Entries", value: entries.length, unit: "", color: "#00F5D4" },
                { label: "XP", value: totalXP, unit: "", color: "#A97FFF" },
              ].map(({ label, value, unit, color }) => (
                <div key={label} style={{ textAlign: "center", padding: "12px 8px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, filter: `drop-shadow(0 0 6px ${color}80)` }}>
                    {value}{unit}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(240,244,255,0.4)", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Truth score trend */}
            {scoresQuery.data && (
              <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(0,245,212,0.06)", border: "1px solid rgba(0,245,212,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "rgba(240,244,255,0.6)" }}>Truth Score</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#00F5D4", filter: "drop-shadow(0 0 6px rgba(0,245,212,0.7))" }}>
                    {Math.round(scoresQuery.data.total_score)}
                  </span>
                </div>
                <div style={{ marginTop: 8, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.07)" }}>
                  <div style={{ height: "100%", width: `${scoresQuery.data.total_score}%`, background: "linear-gradient(90deg,#00F5D4,rgba(0,245,212,0.5))", borderRadius: 999 }} />
                </div>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,245,212,0.1)", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 16 }}>Milestones</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ACHIEVEMENTS.map((a) => (
                <div key={a.label} style={{
                  padding: 12, borderRadius: 10,
                  background: a.done ? `${a.color}0a` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${a.done ? a.color + "25" : "rgba(255,255,255,0.05)"}`,
                  opacity: a.done ? 1 : 0.5,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 6, filter: a.done ? `drop-shadow(0 0 6px ${a.color})` : "none", color: a.color }}>{a.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: a.done ? "#F0F4FF" : "rgba(240,244,255,0.4)" }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: a.done ? a.color : "rgba(240,244,255,0.25)", marginTop: 3 }}>{a.done ? "✓ Complete" : "Locked"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Diary */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,245,212,0.08)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 16 }}>Learning Diary</div>

          {/* Skills tagged from search params */}
          {promptSkills.length > 0 && (
            <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(0,245,212,0.06)", border: "1px solid rgba(0,245,212,0.18)" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#00F5D4", marginBottom: 6 }}>
                Skills tagged from Intel
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {promptSkills.map((skill) => (
                  <span key={skill} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "rgba(0,245,212,0.12)", border: "1px solid rgba(0,245,212,0.3)", color: "#00F5D4" }}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Entry input */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <textarea
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              placeholder="What did you learn today? Any blockers? How are you feeling about the journey?"
              style={{
                flex: 1, padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,245,212,0.14)",
                color: "#F0F4FF", fontSize: 12, lineHeight: 1.6,
                resize: "none" as const, minHeight: 72, fontFamily: "inherit", outline: "none",
              }}
            />
            <button
              onClick={() => saveEntry.mutate()}
              disabled={!entryText.trim() || saveEntry.isPending}
              style={{
                padding: "0 20px", borderRadius: 10,
                background: "rgba(0,245,212,0.1)", border: "1px solid rgba(0,245,212,0.25)",
                color: "#00F5D4", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                whiteSpace: "nowrap", opacity: !entryText.trim() ? 0.4 : 1,
              }}
            >
              {saveEntry.isPending ? "…" : "Add entry"}
            </button>
          </div>

          {error && <p style={{ fontSize: 12, color: "#A97FFF", marginBottom: 12 }}>{error}</p>}

          {/* Entry history */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {historyQuery.isLoading ? (
              <div style={{ height: 80, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }} />
            ) : entries.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(240,244,255,0.3)", fontSize: 13 }}>
                No entries yet. Write your first diary entry above.
              </div>
            ) : (
              entries.map((item) => (
                <div key={item.id} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "rgba(240,244,255,0.35)", letterSpacing: "0.06em" }}>{item.log_date}</span>
                    {item.score_after != null && (
                      <span style={{ fontSize: 10, color: "rgba(0,245,212,0.6)", marginLeft: "auto" }}>
                        Score: {item.score_before ?? "new"} → {item.score_after}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(240,244,255,0.65)", lineHeight: 1.6 }}>{item.entry_text}</p>
                  {item.skills_delta.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                      {item.skills_delta.map((sd) => (
                        <span key={`${item.id}-${sd.taxonomy_key}`} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(0,245,212,0.08)", border: "1px solid rgba(0,245,212,0.2)", color: "#00F5D4" }}>
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
