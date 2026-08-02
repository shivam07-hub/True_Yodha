"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText } from "lucide-react"
import { CVUploadStep } from "@/components/cv/cv-upload-step"
import { Button } from "@/components/ui/button"

interface Props {
  busy: boolean
  error: string | null
  onUpload: (file: File) => void
  onDescribe: (description: string) => void
}

export function ExperienceStep({ busy, error, onUpload, onDescribe }: Props) {
  const [describing, setDescribing] = useState(false)
  const [description, setDescription] = useState("")
  const words = description.trim().split(/\s+/).filter(Boolean).length

  return (
    <CVUploadStep busy={busy} error={error} inputSource="onboarding_upload" onUpload={onUpload}>
      {describing && (
        <div className="mt-5">
          <label htmlFor="experience-description" className="text-sm font-medium text-[var(--tm-text)]">Describe your experience instead</label>
          <textarea id="experience-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder="I work in product operations and have led..." className="tm-control-focus mt-2 w-full resize-y rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 text-base leading-6 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]" />
          <p className="mt-2 text-right text-xs text-[var(--tm-text-faint)]">{words} / 30 words</p>
          <Button type="button" disabled={busy || words < 30} onClick={() => onDescribe(description.trim())} className="mt-3 min-h-12 w-full">
            <FileText className="size-4" aria-hidden="true" /> Create preview
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {!describing && (
          <Button type="button" variant="outline" onClick={() => setDescribing(true)}>
            No CV? Describe your experience
          </Button>
        )}
        <Button variant="outline" render={<Link href="/market" target="_blank" rel="opener" />}>
          Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </CVUploadStep>
  )
}
