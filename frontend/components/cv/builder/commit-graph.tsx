/**
 * Commit-graph atoms: KindDot, CommitRow.
 * Used by BaselineView's left column to draw the immutable version history.
 */
"use client"

import type { CVVersion } from "@/lib/api"
import { formatGlobalVersionLabel, timeAgo } from "@/lib/cv/version-format"

export type KindClass = "master" | "polished" | "edited" | "det"

export function kindClass(kind: CVVersion["kind"]): KindClass {
  if (kind === "baseline_upload") return "master"
  if (kind === "polished") return "polished"
  if (kind === "edited") return "edited"
  return "det"
}

interface KindDotProps {
  kind: CVVersion["kind"]
  current?: boolean
  inline?: boolean
}

export function KindDot({ kind, current, inline }: KindDotProps) {
  const cls = `cvb-graph-node ${kindClass(kind)}${current ? " current" : ""}`
  const style = inline
    ? { position: "static" as const, width: 8, height: 8, transform: "none", display: "inline-block" }
    : undefined
  return <span className={cls} style={style} />
}

interface CommitRowProps {
  v: CVVersion
  isCurrentBaseline: boolean
  selected: boolean
  onSelect: (id: number) => void
  drawTop: boolean
  drawBottom: boolean
}

export function CommitRow({ v, isCurrentBaseline, selected, onSelect, drawTop, drawBottom }: CommitRowProps) {
  const isMaster = v.kind === "baseline_upload"
  const title = isMaster
    ? "Master CV"
    : (v.title?.trim() || formatGlobalVersionLabel(v))
  const context = isMaster
    ? "Master baseline"
    : [v.company_name, v.job_title].filter(Boolean).join(" · ") || "Job-tailored version"

  return (
    <button
      type="button"
      className={`cvb-graph-row${selected ? " selected" : ""}`}
      onClick={() => onSelect(v.id)}
      aria-current={selected ? "true" : undefined}
    >
      <span className="cvb-graph-cell">
        {drawTop &&    <span className="cvb-graph-line" style={{ top: 0, bottom: "50%" }}/>}
        {drawBottom && <span className="cvb-graph-line" style={{ top: "50%", bottom: 0 }}/>}
        <KindDot kind={v.kind} current={isCurrentBaseline}/>
      </span>
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{
            fontSize: 12.5, fontWeight: 500,
            color: selected ? "var(--tm-accent)" : "var(--tm-text)",
            whiteSpace: "nowrap",
          }}>{title}</span>
        </span>
        <span style={{
          fontSize: 11, color: "var(--tm-text-faint)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          <span className="mono">{formatGlobalVersionLabel(v)}</span>
          {" · "}{context}
        </span>
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--tm-text-faint)", whiteSpace: "nowrap" }}>
        {timeAgo(v.created_at)}
      </span>
    </button>
  )
}

interface LegendDotProps {
  cls: KindClass
  label: string
}

export function LegendDot({ cls, label }: LegendDotProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className={`cvb-graph-node ${cls}`} style={{
        position: "static", width: 8, height: 8, transform: "none", display: "inline-block",
      }}/>
      {label}
    </span>
  )
}
