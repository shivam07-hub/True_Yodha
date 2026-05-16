"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { diary } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"


interface Props {
  domain: string
  items: UserSkillItem[]
  avg: number
  isExpanded: boolean
  isBiggestGap: boolean
  onToggle: () => void
  token: string
}

function statusLabel(avg: number) {
  if (avg < 40) return "AT RISK"
  if (avg < 70) return "BUILDING"
  return "STRONG"
}

function barColor(avg: number) {
  if (avg < 40) return "var(--tm-danger)"
  if (avg < 70) return "#d97706"
  return "var(--tm-success)"
}

function levelBadgeColor(level: number) {
  if (level >= 4) return { bg: "var(--tm-accent)", fg: "var(--tm-accent-fg)" }
  if (level >= 3) return { bg: "#065f46", fg: "#6ee7b7" }
  if (level >= 2) return { bg: "#78350f", fg: "#fcd34d" }
  return { bg: "#1f2937", fg: "var(--tm-text-faint)" }
}

function InlineSkillCard({ skill }: { skill: UserSkillItem }) {
  const badge = levelBadgeColor(skill.level)

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-sm)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.3 }}>{skill.display_name}</div>
        <span style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, background: badge.bg, color: badge.fg, fontFamily: "var(--tm-font-mono)",
        }}>L</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, color: "var(--tm-text-faint)", textTransform: "uppercase" }}>
          {skill.proficiency_title}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, fontFamily: "var(--tm-font-mono)",
          color: badge.fg, background: badge.bg,
          borderRadius: 4, padding: "1px 6px",
        }}>
          {skill.level >= 3 ? `${skill.level}+` : skill.level}
        </span>
      </div>
      {skill.evidence_text ? (
        <div style={{ fontSize: 10, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>
          {skill.evidence_text.slice(0, 55)}…
        </div>
      ) : (
        <div style={{ fontSize: 10, color: "#d97706", fontStyle: "italic" }}>No CV evidence — keyword inferred</div>
      )}
    </div>
  )
}

export function DomainAccordionRow({ domain, items, avg, isExpanded, isBiggestGap, onToggle, token }: Props) {
  const [logged, setLogged] = useState(false)
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      diary.createEntry(token,
        `Domain Focus — ${domain}\n\nWeakest domain at ${avg}% strength. Committing to build this domain through deliberate practice.`,
      ),
    onSuccess: () => setLogged(true),
  })
  const maxLevel = items.length ? Math.max(...items.map(s => s.level)) : 0
  const color = barColor(avg)
  const status = statusLabel(avg)

  return (
    <div style={{
      background: isExpanded ? "rgba(20,186,174,0.04)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isExpanded ? "rgba(20,186,174,0.25)" : "var(--tm-border-soft)"}`,
      borderRadius: "var(--tm-radius-sm)",
      transition: "all 200ms var(--tm-ease)",
      overflow: "hidden",
    }}>
      {/* Row header */}
      <button onClick={onToggle} style={{
        width: "100%", display: "grid",
        gridTemplateColumns: "20px 1fr auto auto 52px 32px",
        alignItems: "center", gap: 12,
        padding: "14px 16px", background: "none", border: "none",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      }}>
        <span style={{ fontSize: 11, color: isExpanded ? "var(--tm-accent)" : "var(--tm-text-faint)", transition: "color 200ms" }}>
          {isExpanded ? "▼" : "▶"}
        </span>

        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
            {domain}
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--tm-text-faint)", textTransform: "uppercase" }}>
            {items.length} {items.length === 1 ? "skill" : "skills"} · MAX L{maxLevel}
          </div>
        </div>

        <div style={{ minWidth: 80, textAlign: "right" }}>
          {isBiggestGap ? (
            <span style={{
              display: "inline-block", padding: "3px 8px", borderRadius: 4,
              fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
              background: "rgba(239,68,68,0.15)", color: "#f87171",
              border: "1px solid rgba(239,68,68,0.3)", textTransform: "uppercase",
            }}>BIGGEST GAP</span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", color: "var(--tm-text-faint)", textTransform: "uppercase" }}>
              {status}
            </span>
          )}
        </div>

        <div style={{ width: 120, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${avg}%`, borderRadius: 99, background: color, transition: "width 500ms var(--tm-ease)" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "var(--tm-font-mono)", minWidth: 32, textAlign: "right" }}>
            {avg}%
          </span>
        </div>

        <span style={{ fontSize: 14, color: isExpanded ? "var(--tm-accent)" : "var(--tm-text-faint)", fontWeight: 500, textAlign: "center" }}>
          {isExpanded ? "−" : "+"}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && items.length > 0 && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {items.map(skill => (
              <InlineSkillCard key={skill.key} skill={skill} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <Link href="/cv" style={{
              fontSize: 12, fontWeight: 600, color: "var(--tm-text-faint)", textDecoration: "none",
              padding: "6px 14px", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)",
              transition: "all 150ms", fontFamily: "inherit",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
            >CV →</Link>
            <Link href={`/market?skill=${encodeURIComponent(items[0]?.display_name ?? "")}`} style={{
              fontSize: 12, fontWeight: 600, color: "var(--tm-text-faint)", textDecoration: "none",
              padding: "6px 14px", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)",
              transition: "all 150ms", fontFamily: "inherit",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
            >Intel →</Link>
            <button onClick={() => !logged && mutate()} disabled={isPending || logged}
              style={{
                marginLeft: "auto", padding: "7px 16px", borderRadius: "var(--tm-radius-sm)",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: logged ? "default" : "pointer",
                background: logged ? "transparent" : "var(--tm-accent)",
                color: logged ? "var(--tm-success)" : "var(--tm-accent-fg)",
                border: `1px solid ${logged ? "var(--tm-success)" : "var(--tm-accent)"}`,
                transition: "all 200ms var(--tm-ease)",
              }}>
              {logged ? "✓ Logged to Forge" : isPending ? "Logging…" : "★ Log proof to Forge"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
