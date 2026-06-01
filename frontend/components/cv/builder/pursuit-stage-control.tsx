/**
 * PursuitStageControl — stage move from inside the CV detail (playground).
 *
 * Tracker → CV merge grill 2026-06-02 (Q6): the board gives quick triage; the
 * detail pane gives deep-work. This is the detail-pane half — advance/close a
 * pursuit's stage without leaving the CV you're tailoring. Reuses the pipeline's
 * StatusPicker + labels. Notes/verdict/delete stay on the board (no capability
 * lost); this surfaces the single most useful in-context action.
 */
"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, APPLICATION_OUTCOMES } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { StatusPicker } from "../pipeline/StatusPicker"
import { STAGE_LABEL, OUTCOME_LABEL } from "../pipeline/useTrackerBoard"
import type { StageKey, OutcomeKey } from "../pipeline/useTrackerBoard"

export function PursuitStageControl({ token, application }: {
  token: string
  application: ApplicationResponse
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const updateStatus = useMutation({
    mutationFn: (status: ApplicationStatus) =>
      jobsApi.updateApplication(token, application.job_id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })

  const isOutcome = (APPLICATION_OUTCOMES as readonly string[]).includes(application.status)
  const label = isOutcome
    ? OUTCOME_LABEL[application.status as OutcomeKey]
    : STAGE_LABEL[application.status as StageKey]

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="cvb-btn sm"
        onClick={() => setOpen(o => !o)}
        title="Move this application's stage"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <StatusPicker
          current={application.status}
          onPick={(s) => { setOpen(false); updateStatus.mutate(s) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
