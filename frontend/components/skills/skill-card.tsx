"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { diary } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"

export function SkillCard({ skill, token }: { skill: UserSkillItem; token: string }) {
  const [logged, setLogged] = useState(false)
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      diary.createEntry(
        token,
        `Skill Focus — ${skill.display_name} (${skill.proficiency_title}, Level ${skill.level})\n\nI want to build further on ${skill.display_name} this week. Currently at ${skill.proficiency_title} (L${skill.level}). Goal: push to Level ${Math.min(skill.level + 1, 5)} through deliberate practice and real application.`,
      ),
    onSuccess: () => setLogged(true),
  })

  const levelPct = (skill.level / 5) * 100
  const barColor = skill.level >= 3 ? "var(--tm-success)" : skill.level >= 2 ? "var(--tm-warning)" : "var(--tm-danger)"

  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)" }}>{skill.display_name}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)" }}>L{skill.level}</span>
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
      <button
        onClick={() => !logged && mutate()}
        disabled={isPending || logged}
        style={{
          marginTop: 4, padding: "6px 12px",
          borderRadius: "var(--tm-radius-sm)",
          fontSize: 11, fontWeight: 600,
          background: logged ? "transparent" : "var(--tm-accent)",
          color: logged ? "var(--tm-success)" : "var(--tm-accent-fg)",
          border: `1px solid ${logged ? "var(--tm-success)" : "var(--tm-accent)"}`,
          cursor: logged ? "default" : "pointer",
          transition: "all 200ms var(--tm-ease)",
          fontFamily: "inherit", width: "100%",
        }}
      >
        {logged ? "✓ Logged to Forge" : isPending ? "Logging…" : "Log to Forge"}
      </button>
      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/cv"
          style={{ fontSize: 10, color: "var(--tm-text-faint)", textDecoration: "none", transition: "color 150ms" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--tm-accent)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--tm-text-faint)")}
        >
          CV →
        </Link>
        <Link
          href={`/market?skill=${encodeURIComponent(skill.display_name)}`}
          style={{ fontSize: 10, color: "var(--tm-text-faint)", textDecoration: "none", transition: "color 150ms" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--tm-accent)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--tm-text-faint)")}
        >
          Intel →
        </Link>
      </div>
    </div>
  )
}
