/**
 * ReservoirDump — the "give Myro everything" inflow panel.
 *
 * Drop old CVs (PDF/DOCX), pointer docs (TXT/MD), a LinkedIn export zip, or
 * paste raw text. Files become inflow entries; a durable extractor turns each
 * into roles + stories (the parent view polls while pending). `hero` renders
 * the standalone empty-state variant — the reservoir's front door.
 */
"use client"

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { CareerIngestResponse } from "@/lib/api"
import { cv as cvApi } from "@/lib/api"

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.zip"

export function ReservoirDump({ token, hero = false, onIngested }: {
  token: string
  hero?: boolean
  onIngested: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [skipped, setSkipped] = useState<CareerIngestResponse["skipped"]>([])

  const ingest = useMutation({
    mutationFn: () => cvApi.career.ingest(token, files, text),
    onSuccess: (result) => {
      setSkipped(result.skipped)
      setFiles([])
      setText("")
      if (result.entries.length > 0) onIngested()
    },
  })

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    setFiles((prev) => [...prev, ...Array.from(incoming)].slice(0, 15))
  }
  const canSubmit = !ingest.isPending && (files.length > 0 || text.trim().length >= 80)

  return (
    <section className={`tm-rsv-dump${hero ? " hero" : ""}`}>
      {hero && (
        <header className="tm-rsv-dump-head">
          <h3>Every job you’ve done holds stories.</h3>
          <p>
            Drop everything — old CVs, your LinkedIn export, half-written notes.
            Myro reads it all and builds your career story vault: the raw
            material behind every future CV and interview.
          </p>
        </header>
      )}

      <div
        className={`tm-rsv-dropzone${dragOver ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
      >
        <button type="button" className="tm-rsv-drop-btn" onClick={() => inputRef.current?.click()}>
          <span className="tm-rsv-drop-title">Drop files</span>
          <span className="tm-rsv-drop-sub">CVs · docs · LinkedIn zip</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = "" }}
        />
      </div>

      {files.length > 0 && (
        <ul className="tm-rsv-file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="tm-rsv-file-name">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        className="tm-rsv-paste"
        rows={hero ? 4 : 3}
        placeholder="Or paste anything — achievements, project notes, an old CV…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="tm-rsv-dump-actions">
        <button
          type="button"
          className="cvb-btn primary"
          disabled={!canSubmit}
          onClick={() => ingest.mutate()}
        >
          {ingest.isPending ? "Sending…" : "Build stories"}
        </button>
      </div>

      {ingest.isError && (
        <p className="tm-rsv-dump-error" role="alert">
          {ingest.error instanceof Error ? ingest.error.message : "Upload failed — try again."}
        </p>
      )}
      {skipped.length > 0 && (
        <ul className="tm-rsv-skipped" role="status">
          {skipped.map((s) => (
            <li key={s.filename}>{s.filename} — {s.reason}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
