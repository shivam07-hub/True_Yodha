"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { diary } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { InlineSkillCard } from "@/components/skills/skill-card-inline"


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

      {/* Expanded content — single-column stack (SE10) */}
      {isExpanded && items.length > 0 && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(skill => (
              <InlineSkillCard key={skill.key} skill={skill} token={token} />
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
