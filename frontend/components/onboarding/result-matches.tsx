"use client"

import type { JobMatch } from "@/lib/api"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import { cn } from "@/lib/utils"

interface Props {
  matches: JobMatch[]
  selectedJobId: string | null
  onSelect: (jobId: string) => void
}

export function ResultMatches({ matches, selectedJobId, onSelect }: Props) {
  return (
    <div className="mt-6 space-y-3" role="radiogroup" aria-label="Choose one role to save">
      {matches.map((job) => {
        const selected = selectedJobId === job.job_id
        return (
          <FeedCard
            key={job.job_id}
            data={feedDataFromMatch({ jobId: job.job_id, company: job.company, role: job.title, job, fit: job.match_score })}
            extraClass={cn(selected && "is-open")}
            allowGapActions={false}
            onOpen={() => onSelect(job.job_id)}
            articleProps={{
              role: "radio",
              "aria-checked": selected,
              "aria-expanded": undefined,
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect(job.job_id)
                }
              },
            }}
          />
        )
      })}
    </div>
  )
}
