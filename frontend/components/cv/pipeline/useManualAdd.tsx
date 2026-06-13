"use client"

import { useState } from "react"
import type { ApplicationResponse } from "@/lib/api"
import { ManualAddModal, ADD_JOB_LABEL } from "./ManualAddModal"

// Re-export the canonical name so trigger sites import it from the seam they
// already use. Single source of truth lives in ManualAddModal (the leaf).
export { ADD_JOB_LABEL }

interface UseManualAddOptions {
  token: string
  onSaved: (app: ApplicationResponse) => void
}

/**
 * The single seam for adding a job. Owns the open state and the modal mount;
 * the caller supplies the token and a post-save callback, and renders its own
 * surface-styled trigger button wired to `open()` plus the returned `modal`.
 */
export function useManualAdd({ token, onSaved }: UseManualAddOptions) {
  const [open, setOpen] = useState(false)
  const modal = open ? (
    <ManualAddModal
      token={token}
      onClose={() => setOpen(false)}
      onSaved={(app) => {
        setOpen(false)
        onSaved(app)
      }}
    />
  ) : null
  return { open: () => setOpen(true), modal }
}
