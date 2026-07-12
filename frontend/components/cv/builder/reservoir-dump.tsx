/**
 * ReservoirDump — the "give Myro everything" inflow panel.
 *
 * Drop old CVs (PDF/DOCX), pointer docs (TXT/MD), a LinkedIn export (zip OR the
 * unzipped folder), whole folders of career material, or paste raw text.
 * Folder drops are auto-triaged client-side (supported formats in, LinkedIn
 * telemetry + duplicates named in the receipt) and uploaded in batches, so one
 * drop of a 187-file archive stays one action. Connections.csv found anywhere
 * in the dump is saved for warm intros — receipt line + one-tap undo.
 */
"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { CareerIngestResponse } from "@/lib/api"
import { cv as cvApi, jobs as jobsApi } from "@/lib/api"
import { batches, filesFromDataTransfer, skipSummary, triageFiles, type TriagedFiles } from "@/lib/cv/dump-triage"
import { formatCount } from "@/lib/format"

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.zip"
const CHIP_LIMIT = 8

interface Receipt {
  ingested: number
  skippedLines: string[]
  serverSkipped: CareerIngestResponse["skipped"]
  connectionsSaved: number
}

export function ReservoirDump({ token, hero = false, onIngested }: {
  token: string
  hero?: boolean
  onIngested: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [triageSkipped, setTriageSkipped] = useState<TriagedFiles["skipped"]>([])
  const [text, setText] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [connectionsCleared, setConnectionsCleared] = useState(false)

  // webkitdirectory has no typed JSX attribute — set it on the real node.
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "")
  }, [])

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    setReceipt(null)
    const { send, skipped } = triageFiles([...files, ...incoming])
    setFiles(send)
    setTriageSkipped(skipped)
  }

  const ingest = useMutation({
    mutationFn: async () => {
      const groups = batches(files)
      const total = Math.max(groups.length, 1)
      let ingested = 0
      let connectionsSaved = 0
      const serverSkipped: CareerIngestResponse["skipped"] = []
      if (groups.length === 0) {
        setProgress({ done: 0, total: 1 })
        const result = await cvApi.career.ingest(token, [], text)
        ingested += result.entries.length
        connectionsSaved += result.connections_saved
        serverSkipped.push(...result.skipped)
      }
      for (let i = 0; i < groups.length; i++) {
        setProgress({ done: i, total })
        // Pasted text rides the first batch only.
        const result = await cvApi.career.ingest(token, groups[i], i === 0 ? text : undefined)
        ingested += result.entries.length
        connectionsSaved += result.connections_saved
        serverSkipped.push(...result.skipped)
      }
      return { ingested, connectionsSaved, serverSkipped }
    },
    onSuccess: ({ ingested, connectionsSaved, serverSkipped }) => {
      setReceipt({
        ingested,
        skippedLines: skipSummary(triageSkipped),
        serverSkipped,
        connectionsSaved,
      })
      setConnectionsCleared(false)
      setFiles([])
      setTriageSkipped([])
      setText("")
      if (ingested > 0 || connectionsSaved > 0) onIngested()
    },
    onSettled: () => setProgress(null),
  })

  const undoConnections = useMutation({
    mutationFn: () => jobsApi.clearConnections(token),
    onSuccess: () => setConnectionsCleared(true),
  })

  const canSubmit = !ingest.isPending && (files.length > 0 || text.trim().length >= 80)
  const chipOverflow = files.length - CHIP_LIMIT

  return (
    <section className={`tm-rsv-dump${hero ? " hero" : ""}`}>
      {hero && (
        <header className="tm-rsv-dump-head">
          <h3>Every job you’ve done holds stories.</h3>
          <p>
            Drop everything — old CVs, your LinkedIn export, whole folders of
            notes. Myro reads it all and builds your career story vault: the raw
            material behind every future CV and interview.
          </p>
        </header>
      )}

      <div
        className={`tm-rsv-dropzone${dragOver ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void filesFromDataTransfer(e.dataTransfer).then(addFiles)
        }}
      >
        <button type="button" className="tm-rsv-drop-btn" onClick={() => inputRef.current?.click()}>
          <span className="tm-rsv-drop-title">Drop files or folders</span>
          <span className="tm-rsv-drop-sub">CVs · docs · LinkedIn zip · whole folders</span>
        </button>
        <button
          type="button"
          className="tm-rsv-folder-btn"
          onClick={() => folderRef.current?.click()}
        >
          Choose folder
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = "" }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = "" }}
        />
      </div>

      {files.length > 0 && (
        <ul className="tm-rsv-file-list">
          {files.slice(0, CHIP_LIMIT).map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="tm-rsv-file-name">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              >×</button>
            </li>
          ))}
          {chipOverflow > 0 && <li className="tm-rsv-file-more">+{chipOverflow} more</li>}
        </ul>
      )}
      {triageSkipped.length > 0 && files.length > 0 && (
        <p className="tm-rsv-triage-note" role="status">
          {files.length} ready · {triageSkipped.length} set aside ({skipSummary(triageSkipped).join(", ")})
        </p>
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
          {ingest.isPending
            ? progress && progress.total > 1
              ? `Sending ${progress.done + 1}/${progress.total}…`
              : "Sending…"
            : "Build stories"}
        </button>
      </div>

      {ingest.isError && (
        <p className="tm-rsv-dump-error" role="alert">
          {ingest.error instanceof Error ? ingest.error.message : "Upload failed — try again."}
        </p>
      )}

      {receipt && (
        <div className="tm-rsv-receipt" role="status">
          <p className="tm-rsv-receipt-line">
            {receipt.ingested} {receipt.ingested === 1 ? "file" : "files"} read
            {receipt.skippedLines.length > 0 && ` · set aside: ${receipt.skippedLines.join(", ")}`}
          </p>
          {receipt.connectionsSaved > 0 && !connectionsCleared && (
            <p className="tm-rsv-receipt-line">
              Saved {formatCount(receipt.connectionsSaved)} connections for warm
              intros — name, company, role only.
              <button
                type="button"
                className="tm-rsv-undo"
                disabled={undoConnections.isPending}
                onClick={() => undoConnections.mutate()}
              >
                Undo
              </button>
            </p>
          )}
          {connectionsCleared && <p className="tm-rsv-receipt-line">Connections forgotten.</p>}
          {receipt.serverSkipped.length > 0 && (
            <ul className="tm-rsv-skipped">
              {receipt.serverSkipped.slice(0, 6).map((s) => (
                <li key={s.filename}>{s.filename} — {s.reason}</li>
              ))}
              {receipt.serverSkipped.length > 6 && (
                <li>+{receipt.serverSkipped.length - 6} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
