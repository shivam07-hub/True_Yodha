"use client"

import { useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { CV_UPLOAD_ACCEPT } from "@/lib/cv-file-detect"
import { useCvHandoff } from "./dropzone"

interface LandingUploadButtonProps {
  /** Analytics source, one per placement. */
  source: string
  /** `uploadDestination(pick)`: the scorer, carrying the visitor's pick. */
  destination: string
  children: ReactNode
}

/**
 * An upload in the middle of the story. It opens the file picker where the
 * reader is, instead of scrolling them back to the hero, and hands the file to
 * the same scorer the dropzone does. Paste-text stays on the dropzone.
 */
export function LandingUploadButton({ source, destination, children }: LandingUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handoff = useCvHandoff(destination)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={CV_UPLOAD_ACCEPT}
        hidden
        data-source={source}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) handoff.sendFile(file)
        }}
      />
      <Button
        size="lg"
        loading={handoff.sending}
        onClick={() => {
          trackEvent("cv_upload_started", { source })
          inputRef.current?.click()
        }}
      >
        {handoff.sending ? "Uploading" : children}
      </Button>
    </>
  )
}
