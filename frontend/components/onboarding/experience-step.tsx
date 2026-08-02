"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"

interface Props {
  busy: boolean
  error: string | null
  onUpload: (file: File) => void
  onDescribe: (description: string) => void
}

/* Same three steps the landing page promises (components/public/landing/
   how-it-works.tsx) — repeated verbatim here so the first authed screen
   continues the story the visitor was sold, instead of restating it in prose.
   Deliberately NOT accent-coloured: the accent budget on this screen belongs
   to the dropzone and the two secondary CTAs. */
const STEPS = [
  { n: "01", label: "Upload your CV" },
  { n: "02", label: "Get your Myro Score" },
  { n: "03", label: "Tailor and apply" },
] as const

export function ExperienceStep({ busy, error, onUpload, onDescribe }: Props) {
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
      <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="What happens next">
        {STEPS.map((step, index) => {
          const current = index === 0
          return (
            <li
              key={step.n}
              aria-current={current ? "step" : undefined}
              className={`rounded-md border px-3 py-2 ${current ? "border-[var(--tm-border)] bg-[var(--tm-surface)]" : "border-transparent"}`}
            >
              <span className="block font-mono text-xs uppercase tracking-wide text-[var(--tm-text-muted)]">Step {step.n}</span>
              <span className={`mt-0.5 block text-sm leading-5 ${current ? "font-medium text-[var(--tm-text)]" : "text-[var(--tm-text-muted)]"}`}>
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>

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

      {/* Secondary paths — real CTAs now (Shivam, Aug 2026), outline so they read
          as accent without out-shouting the dropzone, which stays the hero. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {!describing && (
          <Button type="button" variant="outline" onClick={() => setDescribing(true)}>
            No CV? Describe your experience
          </Button>
        )}
        <Button
          variant="outline"
          render={<Link href="/market" target="_blank" rel="noopener noreferrer" />}
        >
          Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
