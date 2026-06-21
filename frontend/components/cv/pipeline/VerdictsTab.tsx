"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ApplicationResponse } from "@/lib/api"
import { APPLICATION_OUTCOMES } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { OUTCOME_LABEL, partitionVerdicts } from "./useTrackerBoard"
import type { OutcomeKey } from "./useTrackerBoard"
import { OutcomeSeal } from "./OutcomeSeal"

interface Props {
  apps: ApplicationResponse[]
  reviewedJobIds: Set<string>
  onOpenReview: (jobId: string) => void
  onDelete: (jobId: string) => void
}

type Filter = "all" | OutcomeKey

export function VerdictsTab({ apps, reviewedJobIds, onOpenReview, onDelete }: Props) {
  const [filter, setFilter] = useState<Filter>("all")
  const verdicts = useMemo(() => partitionVerdicts(apps), [apps])
  const filtered = filter === "all" ? verdicts : verdicts.filter(v => v.status === filter)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {(APPLICATION_OUTCOMES as readonly OutcomeKey[]).map(o => (
          <FilterPill
            key={o}
            label={OUTCOME_LABEL[o]}
            active={filter === o}
            onClick={() => setFilter(o)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: "32px 28px", textAlign: "center", borderRadius: 10,
          border: "1.5px dashed var(--tm-border)", background: "rgba(255,255,255,0.01)",
          fontSize: 13, color: "var(--tm-text-faint)",
        }}>
          No verdicts yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(v => {
            const outcome = v.status as OutcomeKey
            const reviewed = reviewedJobIds.has(v.job_id)
            return (
              <div
                key={v.id}
                style={{
                  position: "relative",
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px 12px 14px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--tm-border-soft)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 2,
                  }}>
                    {OUTCOME_LABEL[outcome]} ·{" "}
                    {v.last_stage_changed_at
                      ? formatDate(v.last_stage_changed_at, "medium")
                      : formatDate(v.created_at, "medium")}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: "var(--tm-text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {v.company ? (
                      <Link
                        href={`/companies/${encodeURIComponent(v.company)}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive)" }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-text)" }}
                      >
                        {v.company}
                      </Link>
                    ) : "—"} <span style={{ color: "var(--tm-text-muted)", fontWeight: 400 }}>· {v.title}</span>
                  </div>
                </div>
                {!reviewed && (
                  <button
                    onClick={() => onOpenReview(v.job_id)}
                    style={{
                      fontSize: 12, padding: "4px 10px", borderRadius: 99,
                      background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
                      color: "var(--tm-interactive)", cursor: "pointer", fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Review pending →
                  </button>
                )}
                <OutcomeSeal outcome={outcome} inline />
                <button
                  onClick={() => onDelete(v.job_id)}
                  title="Delete forever"
                  style={{
                    background: "transparent", border: "none",
                    color: "var(--tm-interactive-rest)", cursor: "pointer",
                    fontSize: 12, fontFamily: "inherit",
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "6px 14px", borderRadius: 99,
        fontSize: 12, fontFamily: "inherit",
        background: active ? "var(--tm-interactive)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border)"}`,
        color: active ? "var(--tm-interactive-fg)" : "var(--tm-interactive-rest)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

