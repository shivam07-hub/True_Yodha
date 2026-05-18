"use client"

import Link from "next/link"
import { MilestoneCard } from "./MilestoneCard"
import type { JobMatch, JobPathResponse, JobPathMilestone } from "@/lib/api"
import type { CartSkill } from "@/types/xp"

interface Achievement {
  label: string
  done: boolean
  icon: string
}

interface RightRailProps {
  job: JobMatch | null
  jobPath: JobPathResponse | undefined
  cartSkills: CartSkill[]
  onRemoveCart: (skill: CartSkill) => void
  onSendBatch: () => void
  achievements: Achievement[]
  proofText: string
  savingProof: boolean
  onProofChange: (v: string) => void
  onSaveProof: (milestone: JobPathMilestone) => void
}

const railCard: React.CSSProperties = {
  background: "var(--tm-surface)",
  border: "1px solid var(--tm-border-soft)",
  borderRadius: 10,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
}

export function RightRail({
  job,
  jobPath,
  cartSkills,
  onRemoveCart,
  onSendBatch,
  achievements,
  proofText,
  savingProof,
  onProofChange,
  onSaveProof,
}: RightRailProps) {
  const earnedCount = achievements.filter(a => a.done).length
  const todayMilestone = jobPath?.today_milestone

  return (
    <>
      {/* 1. Job Path */}
      {jobPath && (
        <div style={railCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 8px var(--tm-accent-glow)", display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text-muted)" }}>
              Job Path · {jobPath.company ?? job?.company ?? ""}
            </span>
            <span style={{
              marginLeft: "auto", fontFamily: "var(--tm-font-mono)", fontSize: 10,
              padding: "2px 8px", borderRadius: 99,
              background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
              color: "var(--tm-accent)", letterSpacing: "0.06em",
            }}>
              {String((jobPath.readiness_tier as Record<string, unknown>).label ?? "building")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{
              fontFamily: "var(--tm-font-mono)", fontSize: 28, fontWeight: 700,
              color: "var(--tm-accent)", filter: "drop-shadow(0 0 6px var(--tm-accent-glow))", lineHeight: 1,
            }}>
              {jobPath.readiness_pct}%
            </span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-muted)" }}>readiness</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${jobPath.readiness_pct}%`, borderRadius: 99,
              background: "linear-gradient(90deg, var(--tm-accent-ring) 0%, var(--tm-accent) 100%)",
              boxShadow: "0 0 8px var(--tm-accent-glow)", transition: "width 600ms var(--tm-ease)",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
            {jobPath.target_skills.length} skill target{jobPath.target_skills.length !== 1 ? "s" : ""} · {jobPath.milestones.length} milestone{jobPath.milestones.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* 2. Today's Milestone */}
      {todayMilestone && (
        <div style={railCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)" }}>Today&apos;s milestone</span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>+30 XP</span>
          </div>
          <MilestoneCard
            milestone={todayMilestone}
            proofText={proofText}
            saving={savingProof}
            onProofChange={onProofChange}
            onSave={() => onSaveProof(todayMilestone)}
          />
        </div>
      )}

      {/* 3. Diary Cart */}
      <div style={{
        ...railCard,
        ...(cartSkills.length > 0 ? { animation: "pulseRing 2.4s ease infinite" } : {}),
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0,
              background: cartSkills.length > 0 ? "var(--tm-accent)" : "var(--tm-text-faint)",
              boxShadow: cartSkills.length > 0 ? "0 0 6px var(--tm-accent-glow)" : "none",
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)" }}>Diary cart</span>
          </div>
          {cartSkills.length > 0 && (
            <span style={{
              fontFamily: "var(--tm-font-mono)", fontSize: 11, padding: "2px 8px", borderRadius: 99,
              background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", color: "var(--tm-accent)",
            }}>
              {cartSkills.length}
            </span>
          )}
        </div>
        {cartSkills.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.55 }}>
            Tap Lock in on any skill above to queue it. Send the batch to your diary in one go.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cartSkills.map(c => (
                <div key={c.skill_name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--tm-text)" }}>{c.skill_name}</span>
                  <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10.5, color: "var(--tm-text-faint)" }}>
                    L{c.level_from}→L{c.level_to}
                  </span>
                  <button
                    onClick={() => onRemoveCart(c)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm-text-faint)", fontSize: 13, padding: "2px 4px", lineHeight: 1, fontFamily: "inherit" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>
                +{cartSkills.length * 30} XP est.
              </span>
              <button
                onClick={onSendBatch}
                style={{
                  padding: "8px 16px", borderRadius: 99, background: "var(--tm-accent)", border: "none",
                  color: "var(--tm-accent-fg)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", boxShadow: "0 0 10px rgba(0,245,212,0.25)",
                }}
              >
                Send batch to diary →
              </button>
            </div>
          </>
        )}
      </div>

      {/* 4. Quick CV */}
      <div style={railCard}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)" }}>CV · quick</span>
        <Link
          href={job?.job_id ? `/cv?jobId=${job.job_id}` : "/cv"}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "9px 0", borderRadius: 6, border: "1px solid var(--tm-accent-ring)", color: "var(--tm-accent)", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
        >
          Open CV Builder →
        </Link>
      </div>

      {/* 5. Achievements */}
      {earnedCount > 0 && (
        <div style={railCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)" }}>Milestones</span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>
              {earnedCount}/{achievements.length}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {achievements.map(a => (
              <span
                key={a.label}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                  ...(a.done ? {
                    background: "var(--tm-accent-wash)",
                    border: "1px solid var(--tm-accent-ring)",
                    color: "var(--tm-accent)",
                  } : {
                    background: "transparent",
                    border: "1px dashed var(--tm-border)",
                    color: "var(--tm-text-faint)",
                  }),
                }}
              >
                {a.icon} {a.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
