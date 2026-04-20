"use client"

import { Sparkles, TrendingUp } from "lucide-react"
import { SkillGraphPreview } from "@/components/skill-graph-preview"
import type { GapSkill } from "@/lib/api"

function urgencyColor(score: number) {
  if (score >= 70) return { bar: "bg-red-500",    badge: "bg-red-500/10 text-red-600",    label: "High priority" }
  if (score >= 40) return { bar: "bg-amber-500",  badge: "bg-amber-500/10 text-amber-600", label: "Medium" }
  return               { bar: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600", label: "Good to have" }
}

interface SkillIntelligencePanelProps {
  gapSkills: GapSkill[]
  isLoading: boolean
}

export function SkillIntelligencePanel({ gapSkills, isLoading }: SkillIntelligencePanelProps) {
  const topGap = gapSkills.slice(0, 8)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Skill Intelligence
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Your current skill map · unlock targets to reach your dream job
        </p>
      </div>

      {/* Skill graph preview */}
      <SkillGraphPreview />

      {/* Gap skills — unlock list */}
      <div>
        <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Skills to unlock
        </h3>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/30" />
            ))}
          </div>
        ) : topGap.length === 0 ? (
          <div className="rounded-xl border border-border px-4 py-8 text-center">
            <p className="text-sm font-medium">No gap data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your CV and compute your score to see your skill gaps.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topGap.map((skill) => {
              const { bar, badge, label } = urgencyColor(skill.gap_score)
              const maxJobs = topGap[0]?.job_count_30d ?? 1
              return (
                <div
                  key={skill.skill}
                  className="rounded-xl border border-border bg-card p-3 space-y-2"
                >
                  {/* Skill name + level + badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{skill.skill}</p>
                      <p className="text-[10px] text-muted-foreground">
                        L{skill.current_level} → L{skill.target_level} · {skill.job_count_30d.toLocaleString()} jobs in 30d
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                      {label}
                    </span>
                  </div>

                  {/* Demand bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${bar}`}
                      style={{ width: `${(skill.job_count_30d / maxJobs) * 100}%` }}
                    />
                  </div>

                  {/* Why it matters */}
                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                    {skill.why_it_matters}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
