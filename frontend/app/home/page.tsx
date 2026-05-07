"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { jobs, scores, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import Link from "next/link"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--tm-text-faint)",
  applied: "var(--tm-accent)",
  interviewing: "var(--tm-success)",
  responded: "var(--tm-warning)",
  offer: "#A78BFA",
  rejected: "var(--tm-danger)",
  no_response: "var(--tm-text-faint)",
  abandoned: "var(--tm-text-faint)",
}

function ScoreBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 4, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: color ?? "var(--tm-accent)", transition: "width 800ms cubic-bezier(0.16,1,0.3,1)", boxShadow: `0 0 6px ${color ?? "var(--tm-accent-glow)"}` }} />
    </div>
  )
}

export default function HomePage() {
  const { token } = useAuth()
  const router = useRouter()
  const [activeJobIdx, setActiveJobIdx] = useState(0)

  const { data: scoreData } = useQuery({ queryKey: dataKeys.scores(), queryFn: () => scores.me(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })
  const { data: profile } = useQuery({ queryKey: dataKeys.profile(), queryFn: () => users.me(token!), enabled: !!token, staleTime: 10 * 60 * 1000 })
  const { data: jobsData } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => withLocalCache(
      userCacheKey(token!, ["matches"]),
      MATCHES_TTL,
      () => jobs.matches(token!),
    ),
    enabled: !!token,
    staleTime: MATCHES_TTL,
  })
  const { data: applications } = useQuery({ queryKey: dataKeys.applications(), queryFn: () => jobs.applications(token!), enabled: !!token, staleTime: 5 * 60 * 1000 })

  const score = scoreData?.total_score ?? 0
  const topJobs = jobsData?.jobs?.slice(0, 5) ?? []
  const apps = applications ?? []
  const activeJob = topJobs[activeJobIdx] ?? null
  const activeJobId = activeJob?.job_id ?? null
  const { data: skillGapData } = useQuery({ queryKey: ["skillGap", activeJobId], queryFn: () => jobs.skillGap(token!, activeJobId!), enabled: !!token && !!activeJobId, staleTime: 10 * 60 * 1000 })

  const pipelineApps = apps.slice(0, 4)
  const targetRoles = profile?.target_roles?.join(", ") ?? "Set your target role"
  const targetLoc = profile?.target_location ?? "Set location"

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Topbar context */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 2 }}>
            Target: {targetRoles} · {targetLoc}
          </div>
          <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", margin: 0 }}>
            Mission Control
          </h1>
        </div>

        {/* Job switcher strip */}
        {topJobs.length > 0 && (
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", flexShrink: 0 }}>Active focus →</span>
              {topJobs.map((j, i) => (
                <button key={j.job_id} onClick={() => setActiveJobIdx(i)} style={{
                  padding: "5px 14px", borderRadius: 99, cursor: "pointer", flexShrink: 0,
                  background: i === activeJobIdx ? "var(--tm-accent)" : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${i === activeJobIdx ? "var(--tm-accent)" : "var(--tm-border)"}`,
                  color: i === activeJobIdx ? "var(--tm-accent-fg)" : "var(--tm-text-muted)",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  transition: "all 200ms var(--tm-ease)",
                }}>
                  {j.company ?? "Company"} · {Math.min(100, Math.round(j.overlap_score))}%
                </button>
              ))}
              <Link href="/market" style={{
                padding: "5px 12px", borderRadius: 99,
                border: "1.5px dashed var(--tm-border)", fontSize: 11,
                color: "var(--tm-text-faint)", cursor: "pointer", textDecoration: "none",
                transition: "all 200ms",
              }}>
                + Add target
              </Link>
            </div>
          </div>
        )}

        {/* Row 1: Score · Active Job · Streak */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr 1fr", gap: 14 }}>

          {/* Score card */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Myro Score</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: "var(--tm-accent)", lineHeight: 1, fontFamily: "var(--tm-font-mono)", filter: "drop-shadow(0 0 12px var(--tm-accent-glow))" }}>
              {Math.round(score)}
            </div>
            <ScoreBar pct={score} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--tm-success)" }}>↑ improving</span>
              <Link href="/skills" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", border: "1px solid var(--tm-border-soft)", borderRadius: 6, padding: "3px 10px" }}>
                Open Skill Intelligence →
              </Link>
            </div>
          </div>

          {/* Active job card */}
          {activeJob ? (
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                Focused on: {activeJob.company ?? ""}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1.2 }}>{activeJob.title}</div>
                  <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 2 }}>
                    {[activeJob.company, activeJob.location].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ padding: "4px 10px", borderRadius: 99, background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)", color: "var(--tm-success)", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  {Math.min(100, Math.round(activeJob.overlap_score))}% fit
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {activeJob.matched_skills?.slice(0, 4).map(s => (
                  <span key={s} style={{ padding: "2px 8px", borderRadius: 99, background: "var(--tm-success-wash)", border: "1px solid var(--tm-success)", color: "var(--tm-success)", fontSize: 11, fontWeight: 500 }}>
                    {s} ✓
                  </span>
                ))}
              </div>
              <button onClick={() => router.push("/diary")} style={{
                padding: "10px 16px", borderRadius: "var(--tm-radius-sm)",
                background: "var(--tm-accent)", border: "none", color: "var(--tm-accent-fg)",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 0 16px var(--tm-accent-glow)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>▶ Forge next gap</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>→ Forge</span>
              </button>
            </div>
          ) : (
            <div style={{ background: "var(--tm-surface)", border: "1px dashed var(--tm-border)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No active job targeted yet</div>
              <Link href="/market" style={{ fontSize: 12, color: "var(--tm-accent)", textDecoration: "none" }}>Browse Intel →</Link>
            </div>
          )}

          {/* Today card */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Today</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1 }}>
              {new Date().toLocaleDateString("en", { weekday: "short" })}
            </div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{new Date().toLocaleDateString("en", { month: "short", day: "numeric" })}</div>
            <Link href="/diary" style={{
              padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
              background: "var(--tm-warning-wash)", border: "1px solid rgba(245,158,11,0.3)",
              color: "var(--tm-warning)", fontSize: 12, fontWeight: 600,
              textDecoration: "none", display: "block", textAlign: "center",
              transition: "all 200ms var(--tm-ease)",
            }}>
              → Enter Forge
            </Link>
          </div>
        </div>

        {/* Row 2: Skill Intelligence · Pipeline · CV Readiness */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14 }}>

          {/* Top Skill Gaps */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              Top Gaps{activeJob ? ` — ${activeJob.company ?? activeJob.title}` : ""}
            </div>
            {!activeJob ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-faint)", textAlign: "center" }}>Save a target job to see your skill gaps</span>
              </div>
            ) : !skillGapData ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Loading gaps…</span>
              </div>
            ) : skillGapData.skills.filter(g => g.missing).length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-success)" }}>No gaps — you meet all requirements ✓</span>
              </div>
            ) : (
              <>
                {skillGapData.skills.filter(g => g.missing).slice(0, 3).map(gap => (
                  <div key={gap.skill} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: gap.user_level === 0 ? "var(--tm-danger)" : "var(--tm-warning)" }}>
                        {gap.user_level === 0 ? "●" : "●"}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--tm-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gap.skill}</span>
                      <span style={{ fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0, fontFamily: "var(--tm-font-mono)" }}>
                        L{gap.user_level}→L{gap.required_level}
                      </span>
                    </div>
                    <button onClick={() => router.push("/diary")} style={{
                      padding: "4px 10px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
                      background: "transparent", border: "1px solid var(--tm-border)",
                      color: "var(--tm-accent)", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                      textAlign: "left", transition: "all 150ms var(--tm-ease)",
                    }}>
                      ▶ Forge this gap
                    </button>
                  </div>
                ))}
              </>
            )}
            <Link href="/skills" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", textAlign: "right", marginTop: "auto" }}>
              View all skill gaps →
            </Link>
          </div>

          {/* Pipeline */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>Pipeline</div>
            {pipelineApps.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>No applications yet</span>
              </div>
            ) : (
              pipelineApps.map(app => (
                <div key={app.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                  <span style={{ fontSize: 13, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{app.company ?? app.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[app.status] ?? "var(--tm-text-faint)", flexShrink: 0, marginLeft: 8 }}>{app.status}</span>
                </div>
              ))
            )}
            <Link href="/tracker" style={{ fontSize: 11, color: "var(--tm-text-faint)", textDecoration: "none", textAlign: "right", marginTop: "auto" }}>
              All applications →
            </Link>
          </div>

          {/* CV readiness */}
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "var(--tm-card-pad)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
              CV — {activeJob?.company ?? "Target"}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--tm-warning)", lineHeight: 1, fontFamily: "var(--tm-font-mono)" }}>
              {activeJob ? `${Math.min(100, Math.round(activeJob.overlap_score))}%` : "—"}
            </div>
            <ScoreBar pct={activeJob ? Math.min(100, activeJob.overlap_score) : 0} color="var(--tm-warning)" />
            <Link href="/cv" style={{
              padding: "9px 14px", borderRadius: "var(--tm-radius-sm)", textAlign: "center",
              background: "var(--tm-accent)", border: "none", color: "var(--tm-accent-fg)",
              fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none",
              display: "block", boxShadow: "0 0 12px var(--tm-accent-glow)",
            }}>
              Generate CV →
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
