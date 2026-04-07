"use client"

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts"

const DOMAIN_LABELS: Record<string, string> = {
  SD: "Software Dev",
  DE: "Data Eng",
  AML: "AI / ML",
  CLD: "Cloud",
  SEC: "Security",
  PMG: "Product",
  BIZ: "Business",
  COM: "Comms",
  LDR: "Leadership",
  OPS: "Operations",
}

interface Props {
  domainScores: Record<string, number>
}

export function DomainRadar({ domainScores }: Props) {
  const data = Object.entries(domainScores).map(([key, value]) => ({
    domain: DOMAIN_LABELS[key] ?? key,
    score: value,
  }))

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="domain"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <Radar
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
