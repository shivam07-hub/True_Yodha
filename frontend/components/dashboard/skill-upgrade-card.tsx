import { Badge } from "@/components/ui/badge"
import type { GapSkill } from "@/lib/api"

interface Props {
  skill: GapSkill
  rank: number
}

export function SkillUpgradeCard({ skill, rank }: Props) {
  const urgencyColor =
    skill.gap_score >= 60 ? "destructive" : skill.gap_score >= 30 ? "secondary" : "secondary"

  return (
    <div className="border border-border rounded-xl p-4 flex gap-4 items-start">
      <span className="text-2xl font-bold text-muted-foreground/30 w-6 shrink-0 mt-0.5">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold leading-tight">{skill.skill}</p>
          <Badge variant={urgencyColor} className="text-xs shrink-0">
            L{skill.current_level} → L{skill.target_level}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          {skill.why_it_matters}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{skill.job_count_30d.toLocaleString()} jobs in 30d</span>
          <span>·</span>
          <span>Gap score: {Math.round(skill.gap_score)}</span>
        </div>
      </div>
    </div>
  )
}
