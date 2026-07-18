"use client"

import { useRef, useState } from "react"
import { FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"

interface Props {
  busy: boolean
  error: string | null
  onUpload: (file: File) => void
  onDescribe: (description: string) => void
  onBrowse: () => void
}

export function ExperienceStep({ busy, error, onUpload, onDescribe, onBrowse }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [describing, setDescribing] = useState(false)
  const [description, setDescription] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

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
        Upload your CV
      </h1>
      <p className="mt-2 text-pretty text-base leading-6 text-[var(--tm-text-muted)]">
        See your Myro Score and matched jobs in under a minute.
      </p>

      {/* The dropzone is the one hero action — everything else is a small link. */}
      <div
        className="mt-6"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) void accept(file) }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`tm-control-focus flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 text-center transition-colors ${dragOver ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] hover:border-[var(--tm-interactive)]"}`}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-[var(--tm-int-bg-wash)] text-[var(--tm-interactive)]"><Upload className="size-6" aria-hidden="true" /></span>
          <span className="text-lg font-medium text-[var(--tm-text)]">Drop your CV here, or choose a file</span>
          <span className="text-sm text-[var(--tm-text-muted)]">PDF or DOCX, up to 10 MB</span>
        </button>
        <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void accept(file) }} />
      </div>

      {message && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{message}</p>}

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

      {/* Secondary paths — deliberately small; the dropzone is the intended action. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-[var(--tm-text-muted)]">
        {!describing && (
          <button type="button" onClick={() => setDescribing(true)} className="tm-control-focus rounded px-2 py-1 underline-offset-4 hover:underline">
            No CV? Describe your experience
          </button>
        )}
        <button type="button" onClick={onBrowse} className="tm-control-focus rounded px-2 py-1 underline-offset-4 hover:underline">
          Browse jobs instead
        </button>
      </div>
    </section>
  )
}
