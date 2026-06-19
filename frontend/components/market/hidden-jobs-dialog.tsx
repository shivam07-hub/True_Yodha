"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { EyeOff, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

export function HiddenJobsDialog({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const hidden = useQuery({ queryKey: dataKeys.hiddenJobs(), queryFn: () => jobs.hiddenJobs(token), enabled: open })
  const restore = useMutation({
    mutationFn: (jobId: string) => jobs.unskipJob(token, jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataKeys.hiddenJobs() })
      void queryClient.invalidateQueries({ queryKey: ["jobFeed"] })
      void queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="tm-feed-iconbtn" aria-label="Open hidden jobs" title="Hidden jobs"><EyeOff className="size-4" /></DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-full max-w-[calc(100%-2rem)] overflow-y-auto bg-[var(--tm-surface)] text-[var(--tm-text)] sm:max-w-xl">
        <DialogHeader><DialogTitle>Hidden jobs</DialogTitle><DialogDescription>Jobs marked Not interested stay out of recommendations until restored.</DialogDescription></DialogHeader>
        {hidden.isLoading ? <p className="py-6 text-sm text-[var(--tm-text-muted)]">Loading...</p> : hidden.data?.length ? (
          <div className="divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)]">
            {hidden.data.map((job) => <div key={job.job_id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{job.job_title}</p><p className="mt-1 truncate text-xs text-[var(--tm-text-muted)]">{[job.company_name, job.location].filter(Boolean).join(" · ")}</p></div><Button size="sm" variant="outline" className="shrink-0" loading={restore.isPending && restore.variables === job.job_id} onClick={() => restore.mutate(job.job_id)}><RotateCcw className="size-3.5" />Restore</Button></div>)}
          </div>
        ) : <p className="py-6 text-sm text-[var(--tm-text-muted)]">No hidden jobs.</p>}
      </DialogContent>
    </Dialog>
  )
}
