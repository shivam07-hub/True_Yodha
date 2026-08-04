"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText } from "lucide-react"
import { CVUploadStep } from "@/components/cv/cv-upload-step"
import { Button } from "@/components/ui/button"

interface Props {
  busy: boolean
  error: string | null
  progressPct?: number | null
  onUpload: (file: File) => void
  onDescribe: (description: string) => void
  /** Guided questions, for someone who opened the box and had nothing to type. */
  onGuideMe: () => void
}

export function ExperienceStep({ busy, error, progressPct = null, onUpload, onDescribe, onGuideMe }: Props) {
  const [describing, setDescribing] = useState(false)
  const [description, setDescription] = useState("")
  const words = description.trim().split(/\s+/).filter(Boolean).length

  return (
    // `showSteps={false}`: onboarding's rail is `JourneyProgress`, rendered by the
    // page above this. Two rails on consecutive screens made progress look like
    // it reset when the user moved from upload to review.
    <CVUploadStep busy={busy} error={error} progressPct={progressPct} inputSource="onboarding_upload" showSteps={false} onUpload={onUpload}>
      {describing && (
        <div className="mt-5">
          <label htmlFor="experience-description" className="text-sm font-medium text-[var(--tm-text)]">Describe your experience instead</label>
          <textarea id="experience-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder="I work in product operations and have led..." className="tm-control-focus mt-2 w-full resize-y rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 text-base leading-6 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]" />
          <p className="mt-2 text-right text-xs text-[var(--tm-text-faint)]">{words} / 30 words</p>
          {/* No longer a "preview". What you type becomes a real CV, scored the
              same way an uploaded one is — the estimate-range path is gone. */}
          <Button type="button" disabled={busy || words < 30} onClick={() => onDescribe(description.trim())} className="mt-3 min-h-12 w-full">
            <FileText className="size-4" aria-hidden="true" /> Build my CV from this
          </Button>
          {/* The guided questions live HERE, not as a third door on the first
              screen — "I don't know what to write" is a feeling you have with the
              box already open, not one you choose between before opening it. */}
          <button type="button" onClick={onGuideMe} disabled={busy} className="tm-control-focus mx-auto mt-3 block rounded px-3 py-2 text-sm text-[var(--tm-text-muted)] underline-offset-4 hover:underline">
            Not sure what to write? Answer a few questions instead
          </button>
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
