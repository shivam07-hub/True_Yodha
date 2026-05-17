"use client"

import type { UserSkillItem } from "@/lib/api"

const LEVEL_LABEL = ["", "Awareness", "Working", "Practitioner", "Expert", "Authority"]

export function SkillAuditView({ allSkills }: { allSkills: UserSkillItem[] }) {
  const weak = allSkills.filter(s => !s.evidence_text)
  const strong = allSkills.filter(s => !!s.evidence_text)

  if (allSkills.length === 0) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>
        Upload a CV to see skill audit
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {weak.length > 0 && (
        <div style={{
          fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--tm-warning, #FFB347)", marginBottom: 6, marginTop: 4,
        }}>
          Proof weak · {weak.length} skills — keyword-inferred only
        </div>
      )}
      {weak.map(s => (
        <div key={s.key} style={{
          display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 10,
          padding: "7px 10px", borderRadius: "var(--tm-radius-sm)",
          background: "rgba(255,179,71,0.04)", border: "1px solid rgba(255,179,71,0.15)",
          alignItems: "center",
        }}>
          <div style={{ fontSize: 12, color: "var(--tm-text)" }}>{s.display_name}</div>
          <div style={{ fontSize: 11, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)" }}>
            L{s.level} · {LEVEL_LABEL[s.level]}
          </div>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 999,
            background: "rgba(255,179,71,0.1)", color: "var(--tm-warning, #FFB347)",
            border: "1px solid rgba(255,179,71,0.3)", whiteSpace: "nowrap",
          }}>Proof weak</span>
        </div>
      ))}
      {strong.length > 0 && (
        <div style={{
          fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--tm-success)", marginTop: 14, marginBottom: 6,
        }}>
          Proof logged · {strong.length} skills
        </div>
      )}
      {strong.map(s => (
        <div key={s.key} style={{
          display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 10,
          padding: "7px 10px", borderRadius: "var(--tm-radius-sm)",
          background: "rgba(74,222,128,0.03)", border: "1px solid rgba(74,222,128,0.1)",
          alignItems: "start",
        }}>
          <div style={{ fontSize: 12, color: "var(--tm-text)" }}>{s.display_name}</div>
          <div style={{ fontSize: 11, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)", paddingTop: 1 }}>
            L{s.level} · {LEVEL_LABEL[s.level]}
          </div>
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.5, fontStyle: "italic" }}>
            &quot;{s.evidence_text?.slice(0, 80)}{(s.evidence_text?.length ?? 0) > 80 ? "…" : ""}&quot;
          </div>
        </div>
      ))}
    </div>
  )
}
