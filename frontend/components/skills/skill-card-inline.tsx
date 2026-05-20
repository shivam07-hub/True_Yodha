"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cv, diary, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"
import { useRecomputeStore } from "@/store/recomputeStore"
import { SkillEditDialog } from "@/components/skills/skill-edit-dialog"

const PROFICIENCY_TITLES = ["None", "Scout", "Trailblazer", "Excavator", "Cartographer", "Legend"]

/** Two-line ladder copy keyed on (current_level, next_level). Static data. */
const LADDER_DESCRIPTOR: Record<string, string> = {
  "0-1": "Show that you have touched this skill in the real world — one shipped task, one project, one workshop. Evidence beats theory.",
  "1-2": "Apply this skill repeatedly without supervision. Multiple completed deliverables that you owned end-to-end.",
  "2-3": "Lead with this skill in a real-stakes context. Mentor others, own the architecture decisions, point to results you can defend.",
  "3-4": "Deploy this skill inside an organisation's operating lifecycle at scale. Measurable business impact — process improved by X%, cost reduced by $Y, system serving Z users. The outcome must be quantifiable and repeatable, not just “used in a project”.",
  "4-5": "Set the standard others learn from. Public talks, published frameworks, hiring decisions made on this skill. Your bar IS the industry bar.",
}

function levelBadgeColor(level: number) {
  if (level >= 4) return { bg: "var(--tm-accent)", fg: "var(--tm-accent-fg)" }
  if (level >= 3) return { bg: "#065f46", fg: "#6ee7b7" }
  if (level >= 2) return { bg: "#78350f", fg: "#fcd34d" }
  return { bg: "#1f2937", fg: "var(--tm-text-faint)" }
}

function gapLabel(level: number): string {
  if (level >= 4) return "Strong"
  if (level >= 2) return "Building"
  return "Gap"
}

function progressColor(level: number): string {
  if (level >= 3) return "var(--tm-success)"
  if (level >= 2) return "#d97706"
  return "var(--tm-danger)"
}

export function InlineSkillCard({ skill, token }: { skill: UserSkillItem; token: string }) {
  const queryClient = useQueryClient()
  const { setBalance } = useXPStore()
  const startRecompute = useRecomputeStore(s => s.start)
  const clearRecompute = useRecomputeStore(s => s.clear)

  const [editOpen, setEditOpen] = useState(false)
  const [logged, setLogged] = useState(false)
  const [advice, setAdvice] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollTimer = useRef<number | null>(null)

  const isFree = skill.forged_level_up_available
  const nextLevel = Math.min(skill.level + 1, 5)
  const badge = levelBadgeColor(skill.level)
  const levelPct = (skill.level / 5) * 100
  const ladder = LADDER_DESCRIPTOR[`${skill.level}-${nextLevel}`] ?? LADDER_DESCRIPTOR["3-4"]

  const askAdvice = useMutation({
    mutationFn: () =>
      users.skillLevelUpAdvice(token, skill.key, skill.level, skill.evidence_text ?? "", isFree),
    onSuccess: (data) => {
      setErrorMsg(null)
      if (data.advice) setAdvice(data.advice)
      if (typeof data.new_xp_balance === "number") setBalance(data.new_xp_balance)
    },
    onError: () => setErrorMsg("Couldn't fetch advice. No XP was spent."),
  })

  const logDiary = useMutation({
    mutationFn: () =>
      diary.createEntry(
        token,
        `Skill Focus — ${skill.display_name} (${skill.proficiency_title}, Level ${skill.level})\n\nI want to push ${skill.display_name} from L${skill.level} to L${nextLevel} this week through deliberate practice and visible proof on real work.`,
      ),
    onSuccess: () => setLogged(true),
  })

  // SE17 — poll cv_versions.recompute_finished_at every 3s, 30s cap. Once set,
  // invalidate userSkills/scores so /skills + score-ring reflect new data.
  function beginRecomputePoll(baselineId: number) {
    startRecompute(baselineId)
    const startedAt = Date.now()
    const tick = async () => {
      try {
        const res = await cv.recomputeStatus(token, baselineId)
        if (res.recompute_finished_at) {
          queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
          queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
          clearRecompute()
          return
        }
      } catch {
        // Network blip — keep polling until cap.
      }
      if (Date.now() - startedAt < 30_000) {
        pollTimer.current = window.setTimeout(tick, 3000)
      } else {
        // Cap hit. Best-effort refresh + stop the shimmer.
        queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
        queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
        clearRecompute()
      }
    }
    pollTimer.current = window.setTimeout(tick, 3000)
  }

  useEffect(() => () => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current)
  }, [])

  return (
    <div className="tm-skill-card-inline" style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-sm)",
      padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Row 1 — name + L · Gap pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.3 }}>
          <span style={{ marginRight: 8, color: progressColor(skill.level) }}>●</span>
          {skill.display_name}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: "var(--tm-font-mono)",
          letterSpacing: "0.05em",
          padding: "4px 10px", borderRadius: 99,
          color: badge.fg, background: "transparent",
          border: `1px solid ${badge.bg}`,
        }}>
          L{skill.level} · {gapLabel(skill.level)}
        </span>
      </div>

      {/* Row 2 — slim progress bar */}
      <div style={{ height: 2, background: "var(--tm-border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${levelPct}%`,
          background: progressColor(skill.level),
          transition: "width 500ms var(--tm-ease)",
        }} />
      </div>

      {/* Row 3 — HOW TO REACH … descriptor */}
      <div>
        <div className="tm-label-caps" style={{ letterSpacing: "0.1em", color: "#d97706", marginBottom: 8 }}>
          How to reach {PROFICIENCY_TITLES[nextLevel]?.toUpperCase()} (L{nextLevel})
        </div>
        <div style={{
          fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)",
        }}>
          {ladder}
        </div>
      </div>

      {/* Row 4 — CV pointer boxed mono pre */}
      <div>
        <div className="tm-label-caps" style={{ letterSpacing: "0.1em", marginBottom: 6, color: "var(--tm-text-faint)" }}>
          CV pointer · current evidence
        </div>
        <div style={{
          padding: "10px 12px",
          background: "rgba(0,0,0,0.25)",
          border: "1px dashed var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-sm)",
          fontFamily: "var(--tm-font-mono)",
          fontSize: 12, lineHeight: 1.65,
          color: skill.evidence_text ? "var(--tm-text)" : "var(--tm-warning, #d97706)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {skill.evidence_text || "No CV evidence — keyword inferred. Edit to add a real pointer."}
        </div>
      </div>

      {/* Row 5 — action buttons */}
      <div className="tm-skill-card-actions" style={{
        display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2,
      }}>
        <ActionBtn
          label="Edit CV pointer"
          icon="✎"
          onClick={() => setEditOpen(true)}
        />
        <ActionBtn
          label={isFree ? "Polish with AI · FREE" : `Polish with AI · -${XP_POLICY.skillAdviceCost} XP`}
          icon={askAdvice.isPending ? "…" : "✦"}
          onClick={() => askAdvice.mutate()}
          disabled={askAdvice.isPending || !!advice}
          accent={isFree}
        />
        <ActionBtn
          label={logged ? "Logged to diary" : "Track in diary"}
          icon={logged ? "✓" : logDiary.isPending ? "…" : "☆"}
          onClick={() => !logged && logDiary.mutate()}
          disabled={logDiary.isPending || logged}
          active={logged}
        />
      </div>

      {advice && (
        <div style={{
          padding: "10px 12px", fontSize: 12, lineHeight: 1.6,
          color: "var(--tm-text-muted)",
          background: "rgba(0,245,212,0.04)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-sm)",
        }}>{advice}</div>
      )}
      {errorMsg && <div style={{ fontSize: 11, color: "var(--tm-danger)" }}>{errorMsg}</div>}

      <SkillEditDialog
        skill={skill}
        token={token}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(baselineId) => beginRecomputePoll(baselineId)}
      />
    </div>
  )
}

function ActionBtn({ label, icon, onClick, disabled, active, accent }: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  accent?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="tm-skill-card-action-btn"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "9px 16px",
        fontSize: 12, fontWeight: 600, fontFamily: "inherit",
        borderRadius: "var(--tm-radius-sm)",
        border: `1px solid ${active ? "var(--tm-success)" : hover && !disabled ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
        background: active ? "rgba(20,186,174,0.10)" : accent && !disabled ? "var(--tm-accent-wash)" : hover && !disabled ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        color: active ? "var(--tm-success)" : accent || (hover && !disabled) ? "var(--tm-accent)" : "var(--tm-text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "all 150ms var(--tm-ease)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      <span className="tm-skill-card-action-label">{label}</span>
    </button>
  )
}
