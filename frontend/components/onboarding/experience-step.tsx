"use client"

import { useRef, useState } from "react"
import { FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"

type Mode = "upload" | "describe"

interface Props {
  busy: boolean
  error: string | null
  onUpload: (file: File) => void
  onDescribe: (description: string) => void
  onBrowse: () => void
}

export function ExperienceStep({ busy, error, onUpload, onDescribe, onBrowse }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>("upload")
  const [description, setDescription] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)

  async function accept(file: File) {
    const check = await preflightCVUploadFile(file)
    if (!check.ok) {
      setFileError(check.message)
      return
    }
    const safeFile = file.name === check.safeName && file.type === check.mime
      ? file
      : new File([file], check.safeName, { type: check.mime })
    setFileError(null)
    onUpload(safeFile)
  }

  const words = description.trim().split(/\s+/).filter(Boolean).length
  const message = fileError ?? error

  return (
    <section className="w-full max-w-xl" aria-labelledby="experience-title">
      <h1 id="experience-title" className="text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">
        Start with what you have
      </h1>
      <p className="mt-2 text-pretty text-base leading-6 text-[var(--tm-text-muted)]">
        Upload your CV, or describe your experience for an early preview.
      </p>

      <div className="mt-7 grid grid-cols-2 gap-1 rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-1" role="tablist" aria-label="Experience source">
        <button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")} className={`tm-control-focus min-h-11 rounded px-3 text-sm font-medium ${mode === "upload" ? "bg-[var(--tm-interactive)] text-[var(--tm-bg)]" : "text-[var(--tm-text-muted)]"}`}>
          Upload CV
        </button>
        <button type="button" role="tab" aria-selected={mode === "describe"} onClick={() => setMode("describe")} className={`tm-control-focus min-h-11 rounded px-3 text-sm font-medium ${mode === "describe" ? "bg-[var(--tm-interactive)] text-[var(--tm-bg)]" : "text-[var(--tm-text-muted)]"}`}>
          Describe experience
        </button>
      </div>

      {mode === "upload" ? (
        <div className="mt-5">
          <button type="button" onClick={() => inputRef.current?.click()} className="tm-control-focus flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[var(--tm-border)] bg-[var(--tm-surface)] px-6 text-center hover:border-[var(--tm-interactive)]">
            <span className="flex size-11 items-center justify-center rounded-full bg-[var(--tm-int-bg-wash)] text-[var(--tm-interactive)]"><Upload className="size-5" aria-hidden="true" /></span>
            <span className="font-medium text-[var(--tm-text)]">Choose a PDF or DOCX</span>
            <span className="text-sm text-[var(--tm-text-muted)]">Up to 10 MB</span>
          </button>
          <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void accept(file) }} />
        </div>
      ) : (
        <div className="mt-5">
          <label htmlFor="experience-description" className="text-sm font-medium text-[var(--tm-text)]">Your experience</label>
          <textarea id="experience-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={7} placeholder="I work in product operations and have led..." className="tm-control-focus mt-2 w-full resize-y rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 text-base leading-6 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]" />
          <p className="mt-2 text-right text-xs text-[var(--tm-text-faint)]">{words} / 30 words</p>
          <Button type="button" disabled={busy || words < 30} onClick={() => onDescribe(description.trim())} className="mt-4 min-h-12 w-full">
            <FileText className="size-4" aria-hidden="true" /> Create preview
          </Button>
        </div>
      )}

      {message && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{message}</p>}
      <button type="button" onClick={onBrowse} className="tm-control-focus mx-auto mt-5 block rounded px-3 py-2 text-sm text-[var(--tm-text-muted)] underline-offset-4 hover:underline">
        Browse jobs instead
      </button>
    </section>
  )
}
