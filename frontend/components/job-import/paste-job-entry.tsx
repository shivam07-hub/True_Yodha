"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { JobImportDialog } from "@/components/job-import/job-import-dialog"
import { Button } from "@/components/ui/button"
import { emitLoopStep } from "@/lib/api"

/**
 * The market's fixed way in: paste a listing and open its tailored CV.
 * Same import model as the onboarding door and Collections.
 */
export function PasteJobEntry({ token }: { token: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (!token) return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Paste a job</Button>
      {open && (
        <JobImportDialog
          token={token}
          onClose={() => setOpen(false)}
          onImported={(jobId) => {
            setOpen(false)
            emitLoopStep(token, "job_imported", jobId, "market")
            router.push(`/cv?jobId=${encodeURIComponent(jobId)}`)
          }}
        />
      )}
    </>
  )
}
