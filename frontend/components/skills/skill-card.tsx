"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { diary, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { useXPGate } from "@/lib/hooks/use-xp-gate"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"

export function SkillCard({ skill, token }: { skill: UserSkillItem; token: string }) {
  const [logged, setLogged] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [advice, setAdvice] = useState<string | null>(null)
  // queryClient not used in compact SkillCard — level correction moved to InlineSkillCard.
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const gate = useXPGate({ cost: XP_POLICY.skillAdviceCost, action: "polish_skill" })

  const logToForge = useMutation({
    mutationFn: () =>
      diary.createEntry(
        token,
        `Skill Focus — ${skill.display_name} (${skill.proficiency_title}, Level ${skill.level})\n\nI want to build further on ${skill.display_name} this week. Currently at ${skill.proficiency_title} (L${skill.level}). Goal: push to Level ${Math.min(skill.level + 1, 5)} through deliberate practice and real application.`,
      ),
    onSuccess: () => setLogged(true),
  })

  // Level correction is handled by InlineSkillCard (full appeal flow). SkillCard is a compact read-only card.

  const askAdvice = useMutation({
    mutationFn: (freeUnlock: boolean) => users.skillLevelUpAdvice(token, skill.key, skill.level, skill.evidence_text ?? "", freeUnlock),
    onSuccess: (data) => {
      if (data.advice) setAdvice(data.advice)
      if (typeof data.new_xp_balance === "number") applyXpChange({ newBalance: data.new_xp_balance, action: "polish_skill" })
    },
  })

  const levelPct = (skill.level / 5) * 100
  const barColor = skill.level >= 3 ? "var(--tm-success)" : skill.level >= 2 ? "var(--tm-warning)" : "var(--tm-danger)"

  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)" }}>{skill.display_name}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tm-interactive)", fontFamily: "var(--tm-font-mono)" }}>L{skill.level}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{skill.proficiency_title}</div>
      <div style={{ height: 3, background: "var(--tm-border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${levelPct}%`, background: barColor, borderRadius: 99 }} />
      </div>
      {skill.evidence_text ? (
        <div style={{ fontSize: 10, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>{skill.evidence_text.slice(0, 60)}…</div>
      ) : (
        <div style={{ fontSize: 10, color: "var(--tm-warning)", fontStyle: "italic" }}>No CV evidence — keyword inferred</div>
      )}

      {skill.forged_level_up_available && !advice && (
        <button
          onClick={() => askAdvice.mutate(true)}
          disabled={askAdvice.isPending}
          style={{
            marginTop: 4, padding: "6px 12px",
            borderRadius: "var(--tm-radius-sm)",
            fontSize: 11, fontWeight: 700,
            background: "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            border: "1px solid var(--tm-interactive)",
            cursor: askAdvice.isPending ? "default" : "pointer",
            transition: "all 200ms var(--tm-ease)",
            fontFamily: "inherit", width: "100%",
          }}
        >
          {askAdvice.isPending ? "Thinking…" : "AI skill upgrade"}
        </button>
      )}

      <button
        onClick={() => !logged && logToForge.mutate()}
        disabled={logToForge.isPending || logged}
        style={{
          marginTop: 4, padding: "6px 12px",
          borderRadius: "var(--tm-radius-sm)",
          fontSize: 11, fontWeight: 600,
          background: logged ? "transparent" : "var(--tm-interactive)",
          color: logged ? "var(--tm-success)" : "var(--tm-interactive-fg)",
          border: `1px solid ${logged ? "var(--tm-success)" : "var(--tm-interactive)"}`,
          cursor: logged ? "default" : "pointer",
          transition: "all 200ms var(--tm-ease)",
          fontFamily: "inherit", width: "100%",
        }}
      >
        {logged ? "✓ Logged to Practice" : logToForge.isPending ? "Logging…" : "Log to Practice"}
      </button>

      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          padding: "4px 8px", border: "none", background: "transparent",
          color: "var(--tm-text-faint)", fontSize: 10, cursor: "pointer",
          textAlign: "left", fontFamily: "inherit",
        }}
      >
        {expanded ? "▾ Hide tools" : "▸ Correct level · Get advice"}
      </button>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, borderTop: "1px dashed var(--tm-border-soft)" }}>
          {/* AI advice */}
          {!skill.forged_level_up_available && (
            <button
              onClick={() => gate.attempt(() => askAdvice.mutate(false))}
              disabled={askAdvice.isPending}
              style={{
                padding: "5px 10px", borderRadius: "var(--tm-radius-sm)",
                background: "transparent", color: "var(--tm-interactive)",
                border: "1px dashed var(--tm-int-border)", fontSize: 10, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {askAdvice.isPending ? "Thinking…" : `How do I level up? · -${XP_POLICY.skillAdviceCost} XP`}
            </button>
          )}
        </div>
      )}

      {advice && (
        <div style={{
          marginTop: 4, padding: "8px 10px", fontSize: 11,
          color: "var(--tm-text-muted)", lineHeight: 1.55,
          background: "var(--tm-int-bg-subtle)", border: "1px solid var(--tm-int-border)",
          borderRadius: "var(--tm-radius-sm)",
        }}>{advice}</div>
      )}
      {askAdvice.isError && (
        <div style={{ marginTop: 4, fontSize: 10, color: "var(--tm-danger)" }}>
          Couldn&apos;t fetch advice. No XP was spent.
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/cv"
          style={{ fontSize: 10, color: "var(--tm-text-faint)", textDecoration: "none", transition: "color 150ms" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--tm-interactive)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--tm-text-faint)")}
        >
          CV →
        </Link>
        <Link
          href={`/market?skill=${encodeURIComponent(skill.display_name)}`}
          style={{ fontSize: 10, color: "var(--tm-text-faint)", textDecoration: "none", transition: "color 150ms" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--tm-interactive)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--tm-text-faint)")}
        >
          Intel →
        </Link>
      </div>
    </div>
  )
}
