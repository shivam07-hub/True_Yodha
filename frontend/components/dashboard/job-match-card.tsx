import { Badge } from "@/components/ui/badge"
import type { JobMatch } from "@/lib/api"

interface Props {
  job: JobMatch
}

function OverlapBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-muted-foreground"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{Math.round(value)}%</span>
    </div>
  )
}

function MatchedSkills({ skills }: { skills: string[] }) {
  if (!skills || skills.length === 0) return null
  const visible = skills.slice(0, 6)
  const overflow = skills.length - visible.length
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {visible.map((s) => (
        <Badge key={s} variant="secondary" className="text-xs font-normal">
          {s}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-xs font-normal">
          +{overflow} more
        </Badge>
      )}
    </div>
  )
}

export function JobMatchCard({ job }: Props) {
  return (
    <div className="border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{job.title}</p>
          <p className="text-xs text-muted-foreground">
            {[job.company, job.location].filter(Boolean).join(" · ") || "Company not listed"}
          </p>
        </div>
        {job.llm_rank && (
          <Badge variant="secondary" className="text-xs shrink-0">
            #{job.llm_rank}
          </Badge>
        )}
      </div>
      <OverlapBar value={job.overlap_score} />
      {job.llm_explanation && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {job.llm_explanation}
        </p>
      )}
      <MatchedSkills skills={job.matched_skills} />
      {job.source_url && (
        <a
          href={job.source_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-foreground underline underline-offset-2"
        >
          View posting
        </a>
      )}
    </div>
  )
}
