"use client"

import { useState } from "react"
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts"
import type { UserSkillItem } from "@/lib/api"
import { DomainDrillDialog } from "./domain-drill-dialog"

interface Props {
  domainScores: Record<string, number>
  skillsByDomain?: Record<string, UserSkillItem[]>
}

interface TickProps {
  x?: number | string
  y?: number | string
  textAnchor?: "start" | "middle" | "end" | "inherit"
  payload?: { value: string }
  onClick: (domain: string) => void
  [key: string]: unknown
}

// Wrap label into lines of at most MAX_CHARS, grouping words greedily
function wrapLines(label: string, maxChars = 15): string[] {
  const words = label.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) {
      cur = next
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function ClickableTick({ x = 0, y = 0, textAnchor = "middle", payload, onClick }: TickProps) {
  const [hovered, setHovered] = useState(false)
  const label = payload?.value ?? ""
  const lines = wrapLines(label)
  const nx = typeof x === "string" ? parseFloat(x) : x
  const ny = typeof y === "string" ? parseFloat(y) : y

  const fontSize = 8
  const charW  = 4.6          // px per char at fontSize 8 sans-serif
  const lineH  = 11           // px between baselines
  const padX   = 6            // horizontal inner padding
  const padY   = 4            // vertical inner padding

  // Box dimensions tight around the wrapped text
  const boxW = Math.max(...lines.map((l) => l.length)) * charW + padX * 2
  const boxH = lines.length * lineH + padY * 2

  // Align box with textAnchor so it always encloses the text
  const boxX =
    textAnchor === "end"    ? nx - boxW :
    textAnchor === "start"  ? nx :
    /* middle */              nx - boxW / 2

  // Center box vertically around recharts' tick anchor point
  const boxY = ny - boxH / 2

  // Text baseline positions: first line sits 70% down from box top
  const firstBaseline = boxY + padY + fontSize

  return (
    <g
      onClick={() => onClick(label)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(label) } }}
      tabIndex={0}
      role="button"
      aria-label={`View skills in ${label}`}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={3}
        ry={3}
        style={{
          fill: hovered ? "var(--tm-accent-wash)" : "transparent",
          stroke: "var(--tm-accent)",
          strokeWidth: 0.75,
          transition: "fill 120ms ease",
        }}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={nx + (textAnchor === "end" ? -padX : textAnchor === "start" ? padX : 0)}
          y={firstBaseline + i * lineH}
          textAnchor={textAnchor}
          fontSize={fontSize}
          style={{
            fill: hovered ? "var(--tm-accent)" : "rgba(240,244,255,0.72)",
            fontFamily: "var(--font-sans), sans-serif",
            transition: "fill 120ms ease",
          }}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

export function DomainRadar({ domainScores, skillsByDomain = {} }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const data = Object.entries(domainScores).map(([key, value]) => ({
    domain: key,
    score: value,
  }))

  const activeDomain = selected ?? ""
  const activeScore = domainScores[activeDomain] ?? 0
  const activeSkills = skillsByDomain[activeDomain] ?? []

  return (
    <>
      <div className="w-full" style={{ height: 432 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%" margin={{ top: 24, right: 64, bottom: 24, left: 64 }}>
            <PolarGrid stroke="rgba(0,245,212,0.1)" />
            <PolarAngleAxis
              dataKey="domain"
              tick={(props: Omit<TickProps, "onClick">) => (
                <ClickableTick {...props} onClick={setSelected} />
              )}
            />
            <Radar
              dataKey="score"
              stroke="#00F5D4"
              fill="#00F5D4"
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {selected && (
        <DomainDrillDialog
          domain={activeDomain}
          score={activeScore}
          skills={activeSkills}
          open={!!selected}
          onOpenChange={(open) => { if (!open) setSelected(null) }}
        />
      )}
    </>
  )
}
