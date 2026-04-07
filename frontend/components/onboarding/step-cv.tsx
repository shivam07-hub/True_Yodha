"use client"

import { useRef, useState, useCallback } from "react"

interface Props {
  onNext: (file: File) => void
}

export function StepCV({ onNext }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(file: File): string | null {
    if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) {
      return "Only PDF or DOCX files are supported."
    }
    if (file.size > 10 * 1024 * 1024) {
      return "File must be under 10MB."
    }
    return null
  }

  function handleFile(file: File) {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onNext(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onNext(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNext])

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Upload your CV</h2>
        <p className="text-sm text-muted-foreground">PDF or DOCX · max 10MB</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full border-2 border-dashed rounded-xl px-8 py-14 flex flex-col items-center gap-3 cursor-pointer transition-colors
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
      >
        <div className="text-4xl">📄</div>
        <p className="text-sm font-medium">Drag and drop your CV here</p>
        <p className="text-xs text-muted-foreground">or click to browse</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
