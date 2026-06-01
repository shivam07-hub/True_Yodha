"use client"

import Link from "next/link"

type LoopStage = "find-job" | "forge" | "log" | "level" | "apply"

interface LoopNode {
  id: LoopStage
  label: string
  xp?: string
  href?: string
}

const NODES: LoopNode[] = [
  { id: "find-job", label: "Find job",  href: "/market" },
  { id: "forge",    label: "Practice",  xp: "+50 XP" },
  { id: "log",      label: "Log",       xp: "+30 XP" },
  { id: "level",    label: "Level up" },
  { id: "apply",    label: "Apply",     href: "/cv?lens=stage" },
]

interface LoopBarProps {
  hasCv: boolean
  hasJob: boolean
  loggedToday: boolean
  hasApplied: boolean
}

function getNextStage(hasCv: boolean, hasJob: boolean, loggedToday: boolean, hasApplied: boolean): LoopStage {
  if (!hasCv || !hasJob) return "find-job"
  if (!loggedToday) return "forge"
  if (loggedToday) return "log"
  if (!hasApplied) return "apply"
  return "level"
}

function getDoneStages(hasCv: boolean, hasJob: boolean, loggedToday: boolean, hasApplied: boolean): Set<LoopStage> {
  const done = new Set<LoopStage>()
  if (hasCv && hasJob) done.add("find-job")
  if (loggedToday) { done.add("forge"); done.add("log") }
  if (hasApplied) done.add("apply")
  return done
}

export function LoopBar({ hasCv, hasJob, loggedToday, hasApplied }: LoopBarProps) {
  const next = getNextStage(hasCv, hasJob, loggedToday, hasApplied)
  const done = getDoneStages(hasCv, hasJob, loggedToday, hasApplied)

  return (
    <div
      aria-label="Your job-search loop"
      style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", overflowX: "auto", scrollbarWidth: "none" }}
    >
      {NODES.map((node, i) => {
        const isNext = node.id === next
        const isDone = done.has(node.id)

        const dot = (
          <div style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: isNext ? "var(--tm-interactive)" : isDone ? "var(--tm-success, #22c55e)" : "var(--tm-border)",
            boxShadow: isNext ? "0 0 8px var(--tm-int-bg-hover)" : "none",
            animation: isNext ? "loop-pulse 2s ease-out infinite" : "none",
            transition: "background 0.2s, box-shadow 0.2s",
          }} />
        )

        const label = (
          <span style={{
            fontSize: 10, fontWeight: isNext ? 700 : 500,
            letterSpacing: isNext ? "0.04em" : "0.02em",
            color: isNext ? "var(--tm-interactive)" : isDone ? "var(--tm-text-faint)" : "var(--tm-text-faint)",
            opacity: isDone && !isNext ? 0.45 : 1,
            textDecoration: isDone && !isNext ? "line-through" : "none",
            whiteSpace: "nowrap",
          }}>
            {node.label}
            {isNext && node.xp && (
              <span style={{ marginLeft: 4, fontSize: 9, color: "var(--tm-interactive)", opacity: 0.75, fontFamily: "var(--tm-font-mono)" }}>
                {node.xp}
              </span>
            )}
          </span>
        )

        const content = (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {dot}
            {node.href && !isNext ? (
              <Link href={node.href} style={{ textDecoration: "none" }}>{label}</Link>
            ) : label}
          </div>
        )

        return (
          <div key={node.id} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && (
              <div style={{ width: 16, height: 1, background: "var(--tm-border-soft)", margin: "0 6px", flexShrink: 0 }} />
            )}
            {content}
          </div>
        )
      })}
    </div>
  )
}
