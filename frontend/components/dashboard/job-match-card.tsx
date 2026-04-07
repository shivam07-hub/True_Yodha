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

export function JobMatchCard({ job }: Props) {
  return (
    <div className="border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{job.title}</p>
          <p className="text-xs text-muted-foreground">{job.company}</p>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          #{job.llm_rank}
        </Badge>
      </div>
      <OverlapBar value={job.overlap_score} />
      {job.llm_explanation && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {job.llm_explanation}
        </p>
      )}
    </div>
  )
}
