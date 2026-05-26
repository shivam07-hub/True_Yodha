"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { diary } from "@/lib/api"

export interface WeakDomain {
  domain: string
  avg: number
  skillCount: number
  noProofCount: number
  maxLevel: number
}

export function WeaknessSpotlight({ weakest, token }: { weakest: WeakDomain; token: string }) {
  const [logged, setLogged] = useState(false)
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      diary.createEntry(
        token,
        `Domain Focus — ${weakest.domain}\n\nThis is my weakest domain at ${weakest.avg}% strength with ${weakest.noProofCount} skills still needing CV evidence. I'm committing to build this domain up through deliberate practice this week.`,
      ),
    onSuccess: () => setLogged(true),
  })

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid var(--tm-border-soft)",
      borderLeft: "3px solid var(--tm-danger)",
      borderRadius: "var(--tm-radius-sm)",
      padding: "16px 20px",
      marginBottom: 20,
      position: "relative",
      zIndex: 1,
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-danger)", fontWeight: 700, marginBottom: 8 }}>
        Biggest Opportunity
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tm-text)", marginBottom: 4 }}>{weakest.domain}</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
            <span style={{ color: "var(--tm-danger)", fontWeight: 600 }}>{weakest.avg}%</span>
            {" · "}{weakest.skillCount} skills
            {weakest.noProofCount > 0 && <span style={{ color: "var(--tm-warning)" }}> · {weakest.noProofCount} need proof</span>}
            {weakest.maxLevel > 0 && <span> · max L{weakest.maxLevel}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => !logged && mutate()}
            disabled={isPending || logged}
            style={{
              padding: "7px 14px", borderRadius: "var(--tm-radius-sm)",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              background: logged ? "transparent" : "var(--tm-interactive)",
              color: logged ? "var(--tm-success)" : "var(--tm-interactive-fg)",
              border: `1px solid ${logged ? "var(--tm-success)" : "var(--tm-interactive)"}`,
              cursor: logged ? "default" : "pointer",
              transition: "all 200ms var(--tm-ease)",
            }}
          >
            {logged ? "✓ Logged" : isPending ? "Logging…" : "Log to Practice"}
          </button>
          <Link href="/cv" style={{
            padding: "7px 14px", borderRadius: "var(--tm-radius-sm)",
            fontSize: 12, fontWeight: 600,
            background: "transparent",
            color: "var(--tm-text-muted)",
            border: "1px solid var(--tm-border-soft)",
            textDecoration: "none",
            transition: "all 200ms var(--tm-ease)",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-interactive)"; e.currentTarget.style.borderColor = "var(--tm-int-border)" }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-muted)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
          >
            CV →
          </Link>
        </div>
      </div>
    </div>
  )
}
