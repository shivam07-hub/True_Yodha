"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { cv, diary, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"
import { useRecomputeStore } from "@/store/recomputeStore"
import { useCartStore } from "@/store/cartStore"
import { LevelDots } from "@/components/skills/level-dots"
import { LEVEL_THRESHOLDS } from "@/lib/level-thresholds"
import { SkillEditDialog } from "@/components/skills/skill-edit-dialog"
import { skillTier, skillTierLabel, TIER_TOKENS } from "@/lib/skill-tier"

const PROFICIENCY_TITLES = ["None", "Scout", "Trailblazer", "Excavator", "Cartographer", "Legend"]

/** Two-line ladder copy keyed on (current_level, next_level). Static data. */
const LADDER_DESCRIPTOR: Record<string, string> = {
  "0-1": "Show that you have touched this skill in the real world — one shipped task, one project, one workshop. Evidence beats theory.",
  "1-2": "Apply this skill repeatedly without supervision. Multiple completed deliverables that you owned end-to-end.",
  "2-3": "Lead with this skill in a real-stakes context. Mentor others, own the architecture decisions, point to results you can defend.",
  "3-4": "Deploy this skill inside an organisation's operating lifecycle at scale. Measurable business impact — process improved by X%, cost reduced by $Y, system serving Z users. The outcome must be quantifiable and repeatable, not just “used in a project”.",
  "4-5": "Set the standard others learn from. Public talks, published frameworks, hiring decisions made on this skill. Your bar IS the industry bar.",
}

export function InlineSkillCard({ skill, token }: { skill: UserSkillItem; token: string }) {
  const queryClient = useQueryClient()
  const { setBalance } = useXPStore()
  const startRecompute = useRecomputeStore(s => s.start)
  const clearRecompute = useRecomputeStore(s => s.clear)
  const addToCart = useCartStore(s => s.addSkill)

  const [editOpen, setEditOpen] = useState(false)
  const [logged, setLogged] = useState(false)
  const [advice, setAdvice] = useState<string | null>(null)
  const [adviceExpanded, setAdviceExpanded] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollTimer = useRef<number | null>(null)

  // Appeal state
  const [appealOpen, setAppealOpen] = useState(false)
  const [appealLevel, setAppealLevel] = useState<number>(skill.level)
  const [appealBullet, setAppealBullet] = useState("")
  const [appealResult, setAppealResult] = useState<import("@/lib/api").SkillAppealResponse | null>(null)

  const isFree = skill.forged_level_up_available
  const nextLevel = Math.min(skill.level + 1, 5)
  const tier = skillTier(skill.level)
  const nextTier = skillTier(nextLevel)
  const tierTokens = TIER_TOKENS[tier]
  const nextTierTokens = TIER_TOKENS[nextTier]
  const ladder = LADDER_DESCRIPTOR[`${skill.level}-${nextLevel}`] ?? LADDER_DESCRIPTOR["3-4"]

  const appealLocked = (skill.correction_count ?? 0) >= 2

  const submitAppeal = useMutation({
    mutationFn: () => users.correctSkillLevel(token, skill.key, appealLevel, appealBullet.trim()),
    onSuccess: (data) => {
      setAppealResult(data)
      if (data.approved) {
        queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
        queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      }
    },
    onError: (err: Error) => {
      if (err.message?.toLowerCase().includes("already changed twice")) {
        setAppealResult({ taxonomy_key: skill.key, new_level: null, total_score: null, approved: false, verdict: "already changed twice", criteria: "", appeals_remaining: 0 })
      }
    },
  })

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

  const sessionsNeeded = LEVEL_THRESHOLDS[skill.level] ?? null

  const logDiary = useMutation({
    mutationFn: () =>
      diary.createEntry(
        token,
        `Skill Focus — ${skill.display_name} (${skill.proficiency_title}, Level ${skill.level})\n\nI want to push ${skill.display_name} from L${skill.level} to L${nextLevel} through ${sessionsNeeded !== null ? `${sessionsNeeded} forge session${sessionsNeeded === 1 ? "" : "s"}` : "deliberate practice"} (25 min each).`,
      ),
    onSuccess: () => {
      setLogged(true)
      addToCart({ skill_name: skill.display_name, level_from: skill.level, level_to: nextLevel })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      // Invalidate diary history and XP balance so wallet reflects +30 XP immediately.
      queryClient.invalidateQueries({ queryKey: ["diary"] })
      queryClient.invalidateQueries({ queryKey: ["xp"] })
    },
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
      {/* Row 1 — name + level dots + tier pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.3, display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <LevelDots level={skill.level} skillName={skill.display_name} size={8} color={tierTokens.fg} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{skill.display_name}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, fontFamily: "var(--tm-font-mono)",
          letterSpacing: "0.05em",
          padding: "4px 10px", borderRadius: 99,
          color: tierTokens.fg, background: tierTokens.bg,
          border: `1px solid ${tierTokens.border}`,
        }}>
          L{skill.level} · {skillTierLabel(skill.level)}
        </span>
      </div>

      {/* Row 3 — HOW TO REACH … descriptor */}
      <div>
        <div className="tm-label-caps" style={{ letterSpacing: "0.1em", color: nextTierTokens.fg, marginBottom: 8 }}>
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
          color: skill.evidence_text ? "var(--tm-text)" : "var(--tm-text-faint)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {skill.evidence_text || (
            <>
              No CV evidence yet ·{" "}
              <Link
                href={`/cv?skill=${encodeURIComponent(skill.display_name)}`}
                style={{ color: "var(--tm-accent-text)", textDecoration: "none" }}
              >
                Add a bullet in CV →
              </Link>
            </>
          )}
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
          label={logged ? "Queued in Forge" : "Track in diary"}
          icon={logged ? "✓" : logDiary.isPending ? "…" : "☆"}
          onClick={() => !logged && logDiary.mutate()}
          disabled={logDiary.isPending || logged}
          active={logged}
          subLabel={!logged ? (sessionsNeeded !== null ? `L${skill.level}→L${nextLevel} · ${sessionsNeeded} session${sessionsNeeded === 1 ? "" : "s"}` : undefined) : undefined}
        />
      </div>

      {advice && (() => {
        const PREVIEW = 240
        const isLong = advice.length > PREVIEW + 40
        const shown = !isLong || adviceExpanded ? advice : `${advice.slice(0, PREVIEW).trimEnd()}…`
        return (
          <div style={{
            padding: "10px 12px", fontSize: 12, lineHeight: 1.6,
            color: "var(--tm-text-muted)",
            background: "rgba(0,245,212,0.04)",
            border: "1px solid var(--tm-accent-ring)",
            borderRadius: "var(--tm-radius-sm)",
            wordBreak: "break-word", overflowWrap: "anywhere",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div>{shown}</div>
            {isLong && (
              <button
                type="button"
                onClick={() => setAdviceExpanded((v) => !v)}
                style={{
                  alignSelf: "flex-start", padding: 0, background: "transparent", border: "none",
                  fontSize: 11, fontWeight: 600, color: "var(--tm-accent)", cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.02em",
                }}
              >
                {adviceExpanded ? "Show less ↑" : "Show more ↓"}
              </button>
            )}
          </div>
        )
      })()}
      {errorMsg && <div style={{ fontSize: 11, color: "var(--tm-danger)" }}>{errorMsg}</div>}

      {/* Appeal level section */}
      {appealLocked && !appealOpen ? (
        <div style={{ fontSize: 11, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
          Level locked — already changed twice
        </div>
      ) : !appealOpen && !appealResult ? (
        <button
          onClick={() => { setAppealOpen(true); setAppealLevel(skill.level); setAppealBullet("") }}
          style={{
            padding: "5px 10px", borderRadius: "var(--tm-radius-sm)",
            fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            border: "1px dashed var(--tm-border-soft)",
            background: "transparent", color: "var(--tm-text-faint)",
            cursor: "pointer", textAlign: "left",
          }}
        >
          ↑ Appeal level
        </button>
      ) : null}

      {appealOpen && !appealResult && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
          <div className="tm-label-caps" style={{ letterSpacing: "0.1em", color: "var(--tm-accent)" }}>
            Appeal level · {(skill.correction_count ?? 0) + 1} of 2
          </div>

          {/* Level picker */}
          <div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginBottom: 6 }}>Select the level you believe you are at</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setAppealLevel(lvl)}
                  title={`L${lvl} · ${PROFICIENCY_TITLES[lvl] ?? ""}`}
                  style={{
                    width: 32, height: 32, borderRadius: "var(--tm-radius-sm)",
                    border: `1px solid ${appealLevel === lvl ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
                    background: appealLevel === lvl ? "var(--tm-accent-wash)" : "transparent",
                    color: appealLevel === lvl ? "var(--tm-accent)" : "var(--tm-text-faint)",
                    fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >L{lvl}</button>
              ))}
            </div>
          </div>

          {/* Bullet textarea */}
          <div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginBottom: 6 }}>
              Write a bullet from your CV or experience that proves L{appealLevel}
            </div>
            <textarea
              value={appealBullet}
              onChange={e => setAppealBullet(e.target.value)}
              placeholder={`What did you actually do with ${skill.display_name}? Be specific — shipped work, team size, measurable result.`}
              rows={3}
              style={{
                width: "100%", padding: "10px 12px",
                fontFamily: "var(--tm-font-body)", fontSize: 12, lineHeight: 1.55,
                color: "var(--tm-text)", background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)",
                resize: "vertical", outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => submitAppeal.mutate()}
              disabled={submitAppeal.isPending || !appealBullet.trim() || appealLevel === skill.level}
              style={{
                padding: "8px 14px", borderRadius: "var(--tm-radius-sm)",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                background: "var(--tm-accent)", color: "var(--tm-accent-fg)",
                border: "1px solid var(--tm-accent)", cursor: submitAppeal.isPending ? "default" : "pointer",
                opacity: (submitAppeal.isPending || !appealBullet.trim() || appealLevel === skill.level) ? 0.5 : 1,
                transition: "all 150ms var(--tm-ease)",
              }}
            >
              {submitAppeal.isPending ? "Judging…" : "Submit appeal"}
            </button>
            <button
              onClick={() => setAppealOpen(false)}
              style={{
                padding: "8px 14px", borderRadius: "var(--tm-radius-sm)",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                background: "transparent", color: "var(--tm-text-faint)",
                border: "1px solid var(--tm-border-soft)", cursor: "pointer",
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {appealResult && (
        <div style={{
          padding: "12px 14px", borderRadius: "var(--tm-radius-sm)",
          border: `1px solid ${appealResult.approved ? "var(--tm-success)" : "var(--tm-danger)"}`,
          background: appealResult.approved ? "rgba(20,186,174,0.06)" : "rgba(239,68,68,0.06)",
        }}>
          {appealResult.verdict === "already changed twice" ? (
            <div style={{ fontSize: 12, color: "var(--tm-danger)", fontWeight: 600 }}>
              already changed twice
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: appealResult.approved ? "var(--tm-success)" : "var(--tm-danger)", marginBottom: 6 }}>
                {appealResult.approved ? "✓ Approved — level updated" : "✗ Not approved"}
              </div>
              <div style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.55, marginBottom: 6 }}>
                {appealResult.verdict}
              </div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: "var(--tm-text-faint)" }}>Bar: </span>
                {appealResult.criteria}
              </div>
              {!appealResult.approved && appealResult.appeals_remaining > 0 && (
                <button
                  onClick={() => { setAppealResult(null); setAppealOpen(true); setAppealBullet("") }}
                  style={{
                    marginTop: 8, padding: "5px 10px", borderRadius: "var(--tm-radius-sm)",
                    fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    background: "transparent", color: "var(--tm-accent)",
                    border: "1px dashed var(--tm-accent-ring)", cursor: "pointer",
                  }}
                >
                  Try again · {appealResult.appeals_remaining} appeal{appealResult.appeals_remaining === 1 ? "" : "s"} remaining
                </button>
              )}
              {!appealResult.approved && appealResult.appeals_remaining === 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
                  already changed twice — no more appeals
                </div>
              )}
            </>
          )}
        </div>
      )}

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

function ActionBtn({ label, icon, onClick, disabled, active, accent, subLabel }: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  accent?: boolean
  subLabel?: string
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
      <span className="tm-skill-card-action-label">
        {label}
        {subLabel && <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 500 }}>{subLabel}</span>}
      </span>
    </button>
  )
}
