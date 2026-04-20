"use client"

import { useRouter } from "next/navigation"
import { ScoreGauge } from "./score-gauge"
import { Badge } from "@/components/ui/badge"
import type { ScoreResponse } from "@/lib/api"

interface Props {
  score: ScoreResponse
}

const DOMAIN_LABELS: Record<string, string> = {
  SD: "Software Dev",
  DE: "Data Engineering",
  AML: "AI / ML",
  CLD: "Cloud",
  SEC: "Security",
  PMG: "Product Mgmt",
  BIZ: "Business",
  COM: "Communication",
  LDR: "Leadership",
  OPS: "Operations",
}

export function StepScore({ score }: Props) {
  const router = useRouter()
  const top3gaps = score.gap_skills.slice(0, 3)

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-lg">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">Your Mirror Score</h2>
        <p className="text-sm text-muted-foreground">Based on your CV vs live market demand</p>
      </div>

      <ScoreGauge score={score.total_score} />

      {/* Domain breakdown */}
      <div className="w-full">
        <h3 className="text-sm font-semibold mb-3">Domain breakdown</h3>
        <div className="flex flex-col gap-2">
          {Object.entries(score.domain_scores).map(([key, val]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">
                {DOMAIN_LABELS[key] ?? key}
              </span>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${val}%` }}
                />
              </div>
              <span className="text-xs font-medium w-8 text-right">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top skill gaps */}
      {top3gaps.length > 0 && (
        <div className="w-full">
          <h3 className="text-sm font-semibold mb-3">Top skills to upgrade</h3>
          <div className="flex flex-col gap-2">
            {top3gaps.map((g) => (
              <div key={g.skill} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{g.skill}</p>
                  <p className="text-xs text-muted-foreground">{g.why_it_matters}</p>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0 ml-3">
                  L{g.current_level} → L{g.target_level}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => router.push("/dashboard")}
        className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        See full dashboard →
      </button>
    </div>
  )
}
