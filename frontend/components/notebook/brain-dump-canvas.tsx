"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cv, type DumpEntry } from "@/lib/api"
import { useSession } from "@/lib/hooks/use-auth"
import { formatDate } from "@/lib/format"
import "./brain-dump-canvas.css"

/**
 * Brain-dump notebook (User Memory Phase 3) — the persistent "what I've done /
 * what I want" notepad (successor to the retired diary). Everything the user
 * writes here is durable and feeds two things: Myro's memory of them (Phase-2
 * distillation) and their CV bullets (the "Add from your experience" intake).
 * Design-over-words: the value is the writing surface, not instructions.
 */
export function BrainDumpCanvas() {
  const { token, ready } = useSession()
  const qc = useQueryClient()
  const [draft, setDraft] = React.useState("")

  const entriesQ = useQuery({
    queryKey: ["cv-dump"],
    queryFn: () => cv.dump.list(token!),
    enabled: !!token,
  })

  const add = useMutation({
    mutationFn: (text: string) => cv.dump.add(token!, text),
    onSuccess: () => {
      setDraft("")
      qc.invalidateQueries({ queryKey: ["cv-dump"] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => cv.dump.remove(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv-dump"] }),
  })

  const trimmed = draft.trim()
  const canSave = trimmed.length > 0 && !add.isPending
  const save = () => {
    if (canSave) add.mutate(trimmed)
  }

  const entries: DumpEntry[] = entriesQ.data?.entries ?? []

  return (
    <div className="bd-canvas">
      <header className="bd-head">
        <h1 className="bd-title">Your notebook</h1>
        <p className="bd-sub">
          Write what you&rsquo;ve done and what you&rsquo;re after. Myro remembers it — and
          can turn it into <Link href="/cv" className="bd-link">CV bullets</Link>.
        </p>
      </header>

      <div className="bd-composer">
        <textarea
          className="bd-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save()
          }}
          placeholder="e.g. Led the campus fest sponsorship drive, closed 4 brand deals worth ₹4L. Want to move from ops into product…"
          rows={5}
          aria-label="Brain-dump entry"
          disabled={!ready}
        />
        <div className="bd-composer-foot">
          <span className="bd-hint">⌘/Ctrl + Enter to save</span>
          <button type="button" className="bd-save" onClick={save} disabled={!canSave}>
            {add.isPending ? "Saving…" : "Save entry"}
          </button>
        </div>
        {add.isError ? <p className="bd-err">Couldn&rsquo;t save — try again.</p> : null}
      </div>

      <div className="bd-entries">
        {entriesQ.isLoading ? (
          <p className="bd-empty">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="bd-empty">Nothing yet. Your first note starts building your memory.</p>
        ) : (
          entries.map((e) => (
            <article key={e.id} className="bd-entry">
              <p className="bd-entry-text">{e.text}</p>
              <div className="bd-entry-foot">
                <time className="bd-entry-time">{formatDate(e.created_at, "medium")}</time>
                <button
                  type="button"
                  className="bd-entry-del"
                  onClick={() => remove.mutate(e.id)}
                  disabled={remove.isPending}
                  aria-label="Delete this entry"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
