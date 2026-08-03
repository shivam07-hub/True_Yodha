"use client"

import { useRef, useState, type ReactNode } from "react"
import { LoaderCircle, Upload } from "lucide-react"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"
import { cn } from "@/lib/utils"

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const STEPS = [
  { n: "01", label: "Upload your CV" },
  { n: "02", label: "Get your Myro Score" },
  { n: "03", label: "Tailor and apply" },
] as const

interface CVUploadStepProps {
  busy: boolean
  error?: string | null
  inputSource?: string
  /** Bytes-sent percentage of the in-flight transfer, when the caller has one. */
  progressPct?: number | null
  onUpload: (file: File) => void
  children?: ReactNode
}

/**
 * The canonical first-CV upload surface. Both the authenticated onboarding
 * flow and the direct CV Hub use this visual contract; their alternate paths
 * (description vs. anonymous paste) are supplied as children.
 */
export function CVUploadStep({ busy, error = null, inputSource, progressPct = null, onUpload, children }: CVUploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
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

  const message = fileError ?? error
  // Only a real, moving percentage earns a bar. The multipart fallback reports
  // none, and a fake bar over an unmeasured wait is worse than no bar.
  const transferring = busy && progressPct !== null && progressPct < 100

  return (
    <section className="w-full max-w-xl" aria-labelledby="cv-upload-title">
      <h1 id="cv-upload-title" className="text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">
        Upload your CV
      </h1>
      <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="What happens next">
        {STEPS.map((step, index) => {
          const current = index === 0
          return (
            <li
              key={step.n}
              aria-current={current ? "step" : undefined}
              className={cn("rounded-md border px-3 py-2", current ? "border-[var(--tm-border)] bg-[var(--tm-surface)]" : "border-transparent")}
            >
              <span className="block font-mono text-xs uppercase tracking-wide text-[var(--tm-text-muted)]">Step {step.n}</span>
              <span className={cn("mt-0.5 block text-sm leading-5", current ? "font-medium text-[var(--tm-text)]" : "text-[var(--tm-text-muted)]")}>
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>

      <div
        className="mt-6"
        onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          const file = event.dataTransfer.files?.[0]
          if (file) void accept(file)
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn("tm-control-focus flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 text-center", dragOver ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] hover:border-[var(--tm-interactive)]")}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-[var(--tm-int-bg-wash)] text-[var(--tm-interactive)]">
            {busy ? <LoaderCircle className="size-6 animate-spin" aria-hidden="true" /> : <Upload className="size-6" aria-hidden="true" />}
          </span>
          {/* Two distinct waits, named separately: the bytes leaving the device
              (measurable, so it gets a bar) and the parse that follows (not).
              One static "Reading your CV…" spanning both read as a hang. */}
          <span className="text-lg font-medium text-[var(--tm-text)]">
            {!busy ? "Drop your CV here, or choose a file" : transferring ? "Sending your CV…" : "Reading your CV…"}
          </span>
          {busy && transferring ? (
            <span className="flex w-full max-w-64 flex-col gap-1.5" aria-hidden="true">
              <span className="h-1 w-full overflow-hidden rounded-full bg-[var(--tm-border)]">
                <span className="block h-full rounded-full bg-[var(--tm-interactive)] transition-[width] duration-200 ease-out" style={{ width: `${progressPct}%` }} />
              </span>
              <span className="font-mono text-xs tabular-nums text-[var(--tm-text-muted)]">{progressPct}%</span>
            </span>
          ) : (
            <span className="text-sm text-[var(--tm-text-muted)]">
              {busy ? "This takes a few seconds." : "PDF or DOCX, up to 10 MB"}
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          data-source={inputSource}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void accept(file)
            event.target.value = ""
          }}
        />
      </div>

      {message && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{message}</p>}
      {children}
    </section>
  )
}
