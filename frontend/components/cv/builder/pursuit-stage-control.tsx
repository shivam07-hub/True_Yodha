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
import { Button } from "@/components/ui/button"
import { APPLICATION_OUTCOMES } from "@/lib/api"
import type { ApplicationResponse } from "@/lib/api"
import { useApplicationStatus } from "@/lib/hooks/use-application-status"
import { StatusPicker } from "../pipeline/StatusPicker"
import { STAGE_LABEL, OUTCOME_LABEL } from "../pipeline/useTrackerBoard"
import type { StageKey, OutcomeKey } from "../pipeline/useTrackerBoard"

export function PursuitStageControl({ token, application }: {
  token: string
  application: ApplicationResponse
}) {
  const [open, setOpen] = useState(false)
  // Shared optimistic stage write — the picker reflects the new stage instantly.
  const { setStatus } = useApplicationStatus(token)

  const isOutcome = (APPLICATION_OUTCOMES as readonly string[]).includes(application.status)
  const label = isOutcome
    ? OUTCOME_LABEL[application.status as OutcomeKey]
    : STAGE_LABEL[application.status as StageKey]

  return (
    <div style={{ position: "relative" }}>
      <Button
        variant="neutral"
        size="sm"
        onClick={() => setOpen(o => !o)}
        title="Move this application's stage"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </Button>
      {open && (
        <StatusPicker
          current={application.status}
          onPick={(s) => { setOpen(false); setStatus(application.job_id, s) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
