"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { diary } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { InlineSkillCard } from "@/components/skills/skill-card-inline"
import { domainTier, domainTierLabel, TIER_TOKENS } from "@/lib/skill-tier"
import "./domain-accordion-row.css"


interface Props {
  domain: string
  items: UserSkillItem[]
  avg: number
  isExpanded: boolean
  isBiggestGap: boolean
  onToggle: () => void
  token: string
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
  const tier = domainTier(avg)
  const color = TIER_TOKENS[tier].fg
  const status = domainTierLabel(avg)

  return (
    <div style={{
      background: isExpanded ? "rgba(20,186,174,0.04)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isExpanded ? "rgba(20,186,174,0.25)" : "var(--tm-border-soft)"}`,
      borderRadius: "var(--tm-radius-sm)",
      transition: "all 200ms var(--tm-ease)",
      overflow: "hidden",
    }}>
      {/* Row header */}
      <button onClick={onToggle} className="tm-domain-accordion-row" style={{
        width: "100%", display: "grid",
        alignItems: "center", gap: 12,
        padding: "14px 16px", background: "none", border: "none",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      }}>
        <div className="tm-domain-accordion-row-main">
          <div className="tm-domain-accordion-row-title" style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {domain}
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--tm-text-faint)", textTransform: "uppercase" }}>
            {items.length} {items.length === 1 ? "skill" : "skills"} · MAX L{maxLevel}
          </div>
        </div>

        <div className="tm-domain-accordion-row-status" style={{ minWidth: 80, textAlign: "right" }}>
          {isBiggestGap ? (
            <span className="tm-domain-gap-badge" style={{
              display: "inline-block", padding: "3px 8px", borderRadius: 4,
              fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
              background: "rgba(239,68,68,0.15)", color: "#f87171",
              border: "1px solid rgba(239,68,68,0.3)", textTransform: "uppercase",
            }}>BIGGEST GAP</span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color, textTransform: "uppercase" }}>
              {status}
            </span>
          )}
        </div>

        <div className="tm-domain-accordion-row-bar" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden", minWidth: 0 }}>
            <div style={{ height: "100%", width: `${avg}%`, borderRadius: 99, background: color, transition: "width 500ms var(--tm-ease)" }} />
          </div>
          <span className="tm-domain-accordion-row-pct" style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "var(--tm-font-mono)", minWidth: 32, textAlign: "right" }}>
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
