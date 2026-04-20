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

function ClickableTick({ x = 0, y = 0, textAnchor = "middle", payload, onClick }: TickProps) {
  const [hovered, setHovered] = useState(false)
  const label = payload?.value ?? ""
  const words = label.split(" ")
  const nx = typeof x === "string" ? parseFloat(x) : x
  const ny = typeof y === "string" ? parseFloat(y) : y

  const lineH = 13
  const boxW = Math.max(...words.map((w) => w.length)) * 5.6 + 16
  const boxH = words.length * lineH + 10
  const boxX = nx - boxW / 2
  const boxY = ny - 12

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
          strokeWidth: 0.8,
          transition: "fill 120ms ease",
        }}
      />
      {words.map((word, i) => (
        <text
          key={i}
          x={nx}
          y={ny + i * lineH}
          textAnchor={textAnchor}
          fontSize={9}
          style={{
            fill: hovered ? "var(--tm-accent)" : "rgba(240,244,255,0.7)",
            fontFamily: "var(--font-sans), sans-serif",
            transition: "fill 120ms ease",
          }}
        >
          {word}
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
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
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
