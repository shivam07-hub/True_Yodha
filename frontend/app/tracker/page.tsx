"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Target } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { jobs, type ApplicationResponse, type ApplicationStatus } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

const STATUSES: ApplicationStatus[] = [
  "pending",
  "applied",
  "no_response",
  "responded",
  "interviewing",
  "rejected",
  "offer",
]

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  applied: "Applied",
  no_response: "No response",
  responded: "Responded",
  interviewing: "Interviewing",
  rejected: "Rejected",
  offer: "Offer",
}

function ApplicationRow({
  application,
  onStatus,
  updating,
}: {
  application: ApplicationResponse
  onStatus: (jobId: number, status: ApplicationStatus) => void
  updating: boolean
}) {
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-3">
        <p className="text-sm font-medium">{application.title}</p>
        <p className="text-xs text-muted-foreground">{application.company ?? "Company not listed"}</p>
      </td>
      <td className="px-3 py-3">
        <select
          value={application.status}
          disabled={updating}
          onChange={(event) => onStatus(application.job_id, event.target.value as ApplicationStatus)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </td>
      <td className="hidden px-3 py-3 text-xs text-muted-foreground sm:table-cell">
        {application.applied_at
          ? new Date(application.applied_at).toLocaleDateString()
          : "Not applied"}
      </td>
    </tr>
  )
}

export default function TrackerPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [updatingJobId, setUpdatingJobId] = useState<number | null>(null)

  const applications = useQuery({
    queryKey: ["applications", token],
    queryFn: () => jobs.applications(token!),
    enabled: !!token,
  })

  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: number; status: ApplicationStatus }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onMutate: ({ jobId }) => setUpdatingJobId(jobId),
    onSettled: () => {
      setUpdatingJobId(null)
      queryClient.invalidateQueries({ queryKey: ["applications", token] })
    },
  })

  const data = applications.data ?? []
  const active = data.filter((item) => ["applied", "responded", "interviewing"].includes(item.status)).length

  if (!ready) return null

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <Target className="h-4 w-4" />
            Application Tracker
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.length} saved roles · {active} active
          </p>
        </div>

        {applications.isLoading ? (
          <div className="flex min-h-56 items-center justify-center rounded-lg border border-border">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Applied</th>
                </tr>
              </thead>
              <tbody>
                {data.map((application) => (
                  <ApplicationRow
                    key={application.id}
                    application={application}
                    updating={updatingJobId === application.job_id}
                    onStatus={(jobId, status) => updateStatus.mutate({ jobId, status })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">No tracked applications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mark a matched role as applied when your outreach begins.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
