"use client"

import { useState } from "react"
import { ADD_JOB_LABEL, JobImportDialog } from "@/components/job-import/job-import-dialog"

export { ADD_JOB_LABEL }

interface UseManualAddOptions {
  token: string
  onSaved: () => void
}

/**
 * The single seam for adding a job on desktop. Owns the open state and the
 * dialog mount; the caller renders its own trigger wired to `open()`.
 */
export function useManualAdd({ token, onSaved }: UseManualAddOptions) {
  const [open, setOpen] = useState(false)
  const modal = open ? (
    <JobImportDialog
      token={token}
      onClose={() => setOpen(false)}
      onImported={() => {
        setOpen(false)
        onSaved()
      }}
    />
  ) : null
  return { open: () => setOpen(true), modal }
}
