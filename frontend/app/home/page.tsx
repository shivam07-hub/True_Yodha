"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { ForgeModal } from "@/components/forge/ForgeModal"
import { DiaryPanel } from "@/components/diary/DiaryPanel"
import { cv, diary, jobs, scores, users, xp } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import type { CartSkill, ForgeSessionResult } from "@/types/xp"
import type { DiaryEntry } from "@/lib/forge-helpers"
import { daysAgo, computeStreak } from "@/lib/forge-helpers"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPStore } from "@/store/xpStore"
import { useCartStore } from "@/store/cartStore"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"
import Link from "next/link"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--tm-text-faint)", applied: "var(--tm-accent)",
  interviewing: "var(--tm-success)", responded: "var(--tm-warning)",
  offer: "#A78BFA", rejected: "var(--tm-danger)",
  no_response: "var(--tm-text-faint)", abandoned: "var(--tm-text-faint)",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Saved", applied: "Applied", interviewing: "Interviewing",
  responded: "Responded", offer: "Offer", rejected: "Rejected",
  no_response: "No Response", abandoned: "Abandoned",
}

// ── Toast (lightweight, no library) ──────────────────────────────────────────

interface ToastState { message: string; key: number }

function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const show = (message: string) => setToast({ message, key: Date.now() })
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])
  return { toast, show }
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

function ScoreBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 3, borderRadius: 99, background: "var(--tm-border-soft)", overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 99,
        background: color ?? "var(--tm-accent)",
        transition: "width 800ms cubic-bezier(0.16,1,0.3,1)",
        boxShadow: `0 0 5px ${color ?? "var(--tm-accent-glow)"}`,
      }} />
    </div>
  )
}

// ── ForgeStrip (cockpit instrument band) ──────────────────────────────────────

interface ForgeStripProps {
  streak: number; sessions: number; xpBalance: number; score: number
  evidenceData: { evidence_count: number; diary_entries_count: number; score_delta: number | null } | null
  onEnterForge: () => void
  onOpenDiary: () => void
}

function ForgeStrip({ streak, sessions, xpBalance, score, evidenceData, onEnterForge, onOpenDiary }: ForgeStripProps) {
  const sinceCvParts: string[] = []
  if (evidenceData) {
    if (evidenceData.score_delta != null) sinceCvParts.push(`+${Math.max(0, Math.round(evidenceData.score_delta))} score`)
    if (evidenceData.diary_entries_count) sinceCvParts.push(`${evidenceData.diary_entries_count} diary entries`)
    if (evidenceData.evidence_count) sinceCvParts.push(`${evidenceData.evidence_count} days`)
  }

  const stats = [
    { label: "STREAK", value: `${streak}`, unit: "d" },
    { label: "SESSIONS", value: `${sessions}`, unit: "" },
    { label: "XP", value: `◆ ${xpBalance}`, unit: "" },
    { label: "SCORE", value: `${Math.round(score)}`, unit: "/100" },
  ]

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,245,212,0.04) 0%, var(--tm-surface) 60%)",
      border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius)",
      padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 0,
    }}>
      {/* Stats */}
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

      {/* Action buttons */}
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--tm-accent-ring)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--tm-border)")}
        >
          Diary + cart
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function HomePageInner() {
  const { token, ready } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const { toast, show: showToast } = useToast()
  const { balance: xpBalance, setBalance: setXPBalance, addBalance } = useXPStore()
  const { skills: cartSkills, addSkill, removeSkill, clearCart } = useCartStore()

  const [activeJobIdx, setActiveJobIdx] = useState(0)
  const [forgeOpen, setForgeOpen] = useState(false)
  const [diaryOpen, setDiaryOpen] = useState(false)

  const urlJobId = searchParams.get("jobId")

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: scoreData } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token, staleTime: 10 * 60 * 1000,
  })
  const { data: jobsData } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => withLocalCache(userCacheKey(token!, ["matches"]), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token, staleTime: MATCHES_TTL,
  })
  const { data: applications } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobs.applications(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })
  const historyQuery = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token!),
    enabled: !!token,
  })
  const { data: evidenceData } = useQuery({
    queryKey: dataKeys.cvEvidence(),
    queryFn: () => cv.evidence(token!),
    enabled: !!token, staleTime: 5 * 60 * 1000,
  })

  // ── Derived ───────────────────────────────────────────────────────────────
  const topJobs = jobsData?.jobs?.slice(0, 5) ?? []
  const apps = applications ?? []
  const pipelineApps = apps.slice(0, 4)
  const entries: DiaryEntry[] = (historyQuery.data?.entries ?? []) as DiaryEntry[]
  const streak = computeStreak(entries)
  const score = scoreData?.total_score ?? 0
  const hasCv = !!scoreData
  const targetRoles = profile?.target_roles?.join(", ") ?? "Set your target role"
  const targetLoc = profile?.target_location ?? "Set location"

  const activeJob = urlJobId
    ? (topJobs.find((j) => j.job_id === urlJobId) ?? null)
    : (topJobs[activeJobIdx] ?? null)

  useEffect(() => {
    if (!token) return
    xp.balance(token).then((r) => setXPBalance(r.balance)).catch(() => {})
  }, [token, setXPBalance])

  const { data: skillGapData } = useQuery({
    queryKey: ["skillGap", activeJob?.job_id],
    queryFn: () => jobs.skillGap(token!, activeJob!.job_id),
    enabled: !!token && !!activeJob?.job_id,
    staleTime: 10 * 60 * 1000,
  })

  const gapSkills = skillGapData?.skills?.filter((g) => g.missing) ?? []

  const ACHIEVEMENTS = [
    { label: "CV Analysed", done: !!scoreData, icon: "◈" },
    { label: "Score Computed", done: !!scoreData, icon: "◉" },
    { label: "First Entry", done: entries.length >= 1, icon: "▣" },
    { label: "5-Day Streak", done: streak >= 5, icon: "◆" },
    { label: "Gap Closed", done: gapSkills.length === 0 && !!activeJob, icon: "◑" },
    { label: "Score 80+", done: score >= 80, icon: "▲" },
  ]
  const earnedAchievements = ACHIEVEMENTS.filter((a) => a.done)

  // ── Diary submit ──────────────────────────────────────────────────────────
  const saveEntry = useMutation({
    mutationFn: ({ text, cart }: { text: string; cart: CartSkill[] }) =>
      diary.createEntry(token!, text, undefined, cart.map((s) => ({ ...s }))),
    onSuccess: () => {
      addBalance(30)
      clearCart()
      showToast("+30 XP · entry logged")
      queryClient.invalidateQueries({ queryKey: dataKeys.diary() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
    },
  })

  async function handleDiarySubmit(text: string, cart: CartSkill[]) {
    await saveEntry.mutateAsync({ text, cart })
  }

  // ── Forge session complete ────────────────────────────────────────────────
  async function handleForgeSession(payload: { skill_name: string; duration_minutes: number }): Promise<ForgeSessionResult> {
    if (!token) throw new Error("Sign in first.")
    const result = await xp.completeForge(token, payload)
    return result
  }

  if (!ready) return null

  return (
    <AppShell>
      {/* Lightweight toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: "var(--z-toast)" as never,
          background: "var(--tm-surface-2)", border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-pill)", padding: "10px 20px",
          fontSize: 13, color: "var(--tm-accent)", fontWeight: 600,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 12px rgba(0,245,212,0.15)",
          whiteSpace: "nowrap", pointerEvents: "none",
        }}>
          {toast.message}
        </div>
      )}

      <div className="tm-page-enter" style={{ overflowY: "auto", height: "100%", padding: "var(--tm-page-py) var(--tm-page-px)", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 1 — Header */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 2 }}>
            Target: {targetRoles} · {targetLoc}
          </div>
          <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", margin: 0 }}>
            Mission Control
          </h1>
        </div>

        {/* 2 — Forge strip */}
        <ForgeStrip
          streak={streak}
          sessions={entries.length}
          xpBalance={xpBalance}
          score={score}
          evidenceData={evidenceData ?? null}
          onEnterForge={() => setForgeOpen(true)}
          onOpenDiary={() => setDiaryOpen(true)}
        />

        <CVRequiredNudge hasCv={hasCv} feature="job matching" />

        {/* 3 — Company tabs */}
        {topJobs.length > 0 && (
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", flexShrink: 0 }}>Active focus →</span>
              {topJobs.map((j, i) => (
                <button key={j.job_id} onClick={() => setActiveJobIdx(i)} style={{
                  padding: "5px 14px", borderRadius: 99, cursor: "pointer", flexShrink: 0,
                  background: i === activeJobIdx ? "var(--tm-accent)" : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${i === activeJobIdx ? "var(--tm-accent)" : "var(--tm-border)"}`,
                  color: i === activeJobIdx ? "var(--tm-accent-fg)" : "var(--tm-text-muted)",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  transition: "all 200ms var(--tm-ease)",
                }}>
                  {j.company ?? "Company"}
                </button>
              ))}
              <Link href="/market" style={{ padding: "5px 12px", borderRadius: 99, border: "1.5px dashed var(--tm-border)", fontSize: 11, color: "var(--tm-text-faint)", cursor: "pointer", textDecoration: "none" }}>
                + Add target
              </Link>
            </div>
          </div>
        )}

        {/* 4 — Hero job card */}
        {activeJob ? (
          <div style={{
            background: "var(--tm-surface)", borderRadius: "var(--tm-radius)",
            border: "2px solid rgba(245,158,11,0.4)",
            padding: "var(--tm-card-pad)",
            display: "flex", flexDirection: "column", gap: 12,
            boxShadow: "0 0 28px rgba(245,158,11,0.08)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-warning)", marginBottom: 4 }}>
                  Focused on: {activeJob.company ?? ""}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1.2 }}>{activeJob.title}</div>
                <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 3 }}>
                  {[activeJob.company, activeJob.location].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ padding: "5px 12px", borderRadius: 99, background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)", color: "var(--tm-success)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {Math.min(100, Math.round(activeJob.overlap_score))}% fit
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {activeJob.matched_skills?.slice(0, 5).map((s) => (
                <span key={s} style={{ padding: "2px 9px", borderRadius: 99, background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)", color: "var(--tm-success)", fontSize: 11 }}>
                  {s} ✓
                </span>
              ))}
            </div>
            <button
              onClick={() => setForgeOpen(true)}
              style={{
                padding: "10px 16px", borderRadius: "var(--tm-radius-sm)", alignSelf: "flex-start",
                background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
                color: "var(--tm-warning)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ▶ Forge: {gapSkills[0]?.skill ?? "next gap"}
            </button>
          </div>
        ) : (
          <div style={{ padding: "28px", textAlign: "center", borderRadius: "var(--tm-radius)", border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No active job targeted yet</div>
            <Link href="/market" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>Browse Intel →</Link>
          </div>
        )}

        {/* 5 — 3-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14 }}>

          {/* Skill gaps */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              Top Gaps{activeJob ? ` — ${activeJob.company ?? activeJob.title}` : ""}
            </div>
            {!activeJob ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Save a target job to see your skill gaps</span>
              </div>
            ) : !skillGapData ? (
              <div style={{ height: 60, borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }} />
            ) : gapSkills.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-success)" }}>No gaps — you meet all requirements ✓</span>
              </div>
            ) : (
              <>
                {gapSkills.slice(0, 3).map((gap) => (
                  <div key={gap.skill} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: gap.user_level === 0 ? "var(--tm-danger)" : "var(--tm-warning)" }}>●</span>
                      <span style={{ fontSize: 13, color: "var(--tm-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gap.skill}</span>
                      <span style={{ fontSize: 10, color: "var(--tm-text-faint)", flexShrink: 0, fontFamily: "var(--tm-font-mono)" }}>
                        L{gap.user_level}→L{gap.required_level}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setForgeOpen(true)}
                        style={{ padding: "3px 10px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer", background: "transparent", border: "1px solid var(--tm-border)", color: "var(--tm-accent)", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}
                      >
                        ▶ Forge
                      </button>
                      <button
                        onClick={() => addSkill({ skill_name: gap.skill, level_from: gap.user_level, level_to: gap.required_level, company: activeJob?.company ?? undefined })}
                        style={{
                          padding: "3px 10px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
                          background: cartSkills.some((s) => s.skill_name === gap.skill) ? "rgba(0,245,212,0.08)" : "transparent",
                          border: `1px solid ${cartSkills.some((s) => s.skill_name === gap.skill) ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                          color: cartSkills.some((s) => s.skill_name === gap.skill) ? "var(--tm-accent)" : "var(--tm-text-faint)",
                          fontSize: 11, fontFamily: "inherit",
                        }}
                      >
                        {cartSkills.some((s) => s.skill_name === gap.skill) ? "✓ Cart" : "+ Cart"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
            <Link href="/skills" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", textAlign: "right", marginTop: "auto" }}>
              View all →
            </Link>
          </div>

          {/* Pipeline */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Pipeline</div>
            {pipelineApps.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>No applications yet</span>
              </div>
            ) : (
              pipelineApps.map((app) => (
                <div key={app.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "7px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {app.company ?? app.title}
                    </span>
                    <span style={{ fontSize: 10, flexShrink: 0, color: STATUS_COLOR[app.status] ?? "var(--tm-text-faint)" }}>
                      {STATUS_LABEL[app.status] ?? app.status} · {daysAgo(app.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.title}</div>
                  <button
                    onClick={() => router.push(`/home?jobId=${app.job_id}`)}
                    style={{ alignSelf: "flex-end", padding: "3px 10px", borderRadius: "var(--tm-radius-sm)", background: "transparent", border: "1px solid var(--tm-border)", color: "var(--tm-text-faint)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Log update →
                  </button>
                </div>
              ))
            )}
            <Link href="/tracker" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", textAlign: "right", marginTop: "auto" }}>
              All applications →
            </Link>
          </div>

          {/* CV Unlock */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              CV — {activeJob?.company ?? "Target"}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--tm-warning)", lineHeight: 1, fontFamily: "var(--tm-font-mono)" }}>
              {activeJob ? `${Math.min(100, Math.round(activeJob.overlap_score))}%` : "—"}
            </div>
            <ScoreBar pct={activeJob ? Math.min(100, activeJob.overlap_score) : 0} color="var(--tm-warning)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <button
                onClick={async () => {
                  if (!token) return
                  try {
                    const result = await xp.spend(token, 100, "rewrite_cv_line")
                    setXPBalance(result.balance)
                    showToast("CV line rewriting… −100 XP")
                  } catch {
                    showToast("Not enough XP — forge a session to earn more")
                  }
                }}
                style={{ padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--tm-warning)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                Rewrite CV line &nbsp;<span style={{ fontFamily: "var(--tm-font-mono)", color: "var(--tm-accent)" }}>◆ 100 XP</span>
              </button>
              <button
                onClick={async () => {
                  if (!token) return
                  try {
                    const result = await xp.spend(token, 50, "download_cv")
                    setXPBalance(result.balance)
                    showToast("Download unlocked −50 XP")
                  } catch {
                    showToast("Not enough XP — forge a session to earn more")
                  }
                }}
                style={{ padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-faint)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                Download tailored CV &nbsp;<span style={{ fontFamily: "var(--tm-font-mono)", color: "var(--tm-accent)" }}>◆ 50 XP</span>
              </button>
              <Link href="/cv" style={{ padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent)", border: "none", color: "var(--tm-accent-fg)", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center", display: "block" }}>
                Open CV Builder →
              </Link>
            </div>
          </div>
        </div>

        {/* 6 — Achievements pill row */}
        {earnedAchievements.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>
            {earnedAchievements.map((a) => (
              <span key={a.label} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 12px", borderRadius: 999,
                background: "rgba(0,245,212,0.08)", border: "1px solid var(--tm-accent-ring)",
                fontSize: 11, color: "var(--tm-accent)", fontWeight: 600,
              }}>
                {a.icon} {a.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Forge modal */}
      {forgeOpen && (
        <ForgeModal
          cartSkills={cartSkills.length > 0 ? cartSkills : gapSkills.slice(0, 3).map((g) => ({ skill_name: g.skill, level_from: g.user_level, level_to: g.required_level, company: activeJob?.company ?? undefined }))}
          onClose={() => setForgeOpen(false)}
          onXPEarned={(amount, newBalance) => { addBalance(amount); setXPBalance(newBalance) }}
          onCompleteSession={handleForgeSession}
          onOpenDiary={() => setDiaryOpen(true)}
        />
      )}

      {/* Diary panel */}
      <DiaryPanel
        open={diaryOpen}
        onClose={() => setDiaryOpen(false)}
        cartSkills={cartSkills}
        onAddSkill={addSkill}
        onRemoveSkill={removeSkill}
        gapSkills={gapSkills.map((g) => ({ skill: g.skill, user_level: g.user_level, required_level: g.required_level }))}
        activeCompany={activeJob?.company}
        onSubmit={handleDiarySubmit}
        recentEntries={entries}
      />
    </AppShell>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  )
}
