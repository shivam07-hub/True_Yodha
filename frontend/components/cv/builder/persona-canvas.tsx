/**
 * PersonaCanvas — "What Myro knows about you" (Lane B), the living document.
 *
 * One narrative in three movements (past / present / future) written by the
 * persona synthesizer from the evidence substrate, threaded on the career
 * meridian (roles → NOW → projected arc). Every paragraph carries the signal
 * lines it draws on — real saved/dismissed/tailored/search counts — so the
 * document reads grounded, never vague. Edits are law: an edited paragraph
 * becomes the user's words, pinned, and survives every regeneration.
 */
"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { memory as memoryApi } from "@/lib/api"
import type { PersonaParagraph, PersonaTimelineRole } from "@/lib/api"
import { formatRelativeAge } from "@/lib/format"
import "./persona-canvas.css"

const MOVEMENTS = [
  { key: "past", numeral: "I", title: "Where you've been" },
  { key: "present", numeral: "II", title: "Where you stand" },
  { key: "future", numeral: "III", title: "Where you're headed" },
] as const

const POLL_CAP = 15 // stop polling a pending canvas after ~1 min

/** First clause of a signal line — the at-a-glance data point. */
function groundChip(line: string): string {
  const cut = line.split(" — ")[0].split(". ")[0].trim()
  return cut.length > 52 ? `${cut.slice(0, 49)}…` : cut
}

function yearOf(role: PersonaTimelineRole): string {
  if (role.started_on) return role.started_on.slice(0, 4)
  return role.date_label.match(/\d{4}/)?.[0] ?? ""
}

function Paragraph({ token, paragraph }: { token: string; paragraph: PersonaParagraph }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(paragraph.text)

  const save = useMutation({
    mutationFn: () => memoryApi.personaEdit(token, paragraph.id, { text: draft.trim() }),
    onSuccess: () => {
      setEditing(false)
      void qc.invalidateQueries({ queryKey: ["personaCanvas"] })
    },
  })

  if (editing) {
    return (
      <div className={`tm-pc-para${paragraph.pinned ? " is-pinned" : ""}`}>
        <textarea
          className="tm-pc-edit-input"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Edit this passage"
        />
        <div className="tm-pc-edit-actions">
          <button
            type="button"
            className="cvb-btn primary sm"
            disabled={!draft.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Save — becomes yours
          </button>
          <button
            type="button"
            className="cvb-btn ghost sm"
            onClick={() => { setEditing(false); setDraft(paragraph.text) }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`tm-pc-para${paragraph.pinned ? " is-pinned" : ""}`}>
      {paragraph.pinned && <span className="tm-pc-pin-tag">Yours · pinned</span>}
      <p className="tm-pc-text">{paragraph.text}</p>
      {paragraph.grounds.length > 0 && (
        <span className="tm-pc-grounds">
          {paragraph.grounds.slice(0, 3).map((g) => (
            <span key={g} className="tm-pc-ground" title={g}>{groundChip(g)}</span>
          ))}
        </span>
      )}
      <button type="button" className="tm-pc-edit-btn" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  )
}

function Rail({ movement, timeline }: { movement: string; timeline: PersonaTimelineRole[] }) {
  if (movement === "past") {
    const nodes = timeline.slice(0, 4)
    return (
      <div className="tm-pc-rail" aria-hidden="true">
        <span className="tm-pc-line" />
        {nodes.map((r, i) => (
          <span
            key={`${r.company}-${r.title}-${i}`}
            className="tm-pc-node"
            style={{ top: `${12 + (i * 72) / Math.max(nodes.length, 1)}%` }}
          >
            <span className="tm-pc-yr">{[yearOf(r), r.company || r.title].filter(Boolean).join(" · ")}</span>
            <span className="tm-pc-dot" />
          </span>
        ))}
      </div>
    )
  }
  if (movement === "present") {
    return (
      <div className="tm-pc-rail" aria-hidden="true">
        <span className="tm-pc-line" />
        <span className="tm-pc-node is-now" style={{ top: "24%" }}>
          <span className="tm-pc-yr">Now</span>
          <span className="tm-pc-dot" />
        </span>
      </div>
    )
  }
  return (
    <div className="tm-pc-rail" aria-hidden="true">
      <span className="tm-pc-line is-projected" />
      <span className="tm-pc-node is-terminal" style={{ top: "78%" }}>
        <span className="tm-pc-dot" />
      </span>
    </div>
  )
}

export function PersonaCanvas({ token }: { token: string }) {
  const qc = useQueryClient()
  const polls = useRef(0)

  const persona = useQuery({
    queryKey: ["personaCanvas"],
    queryFn: () => memoryApi.persona(token),
    refetchInterval: (query) => {
      if (query.state.data?.status !== "pending") return false
      polls.current += 1
      return polls.current <= POLL_CAP ? 4000 : false
    },
  })

  const refresh = useMutation({
    mutationFn: () => memoryApi.personaRefresh(token),
    onSuccess: () => {
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["personaCanvas"] }), 8000)
    },
  })

  const data = persona.data
  const timeline = data?.timeline ?? []

  return (
    <section className="tm-pc" aria-label="What Myro knows about you">
      <header className="tm-pc-head">
        <p className="tm-pc-eyebrow">Career memory — a living document</p>
        <h2 className="tm-pc-title">What Myro knows about you</h2>
        <p className="tm-pc-meta">
          Written from your evidence, refreshed as you work.{" "}
          <strong>Your edits are law</strong> — Myro writes around them, never over them.
        </p>
        <div className="tm-pc-badges">
          {data?.cosmos === "on_file" ? (
            <span className="tm-pc-badge is-lit">✦ Birth chart on file</span>
          ) : (
            <span className="tm-pc-badge">○ Second lens unlit</span>
          )}
          {data?.generated_at && (
            <span className="tm-pc-updated">
              Updated {formatRelativeAge(new Date(data.generated_at).getTime())}
              {" · "}
              <button
                type="button"
                className="tm-pc-refresh"
                disabled={refresh.isPending || refresh.isSuccess}
                onClick={() => refresh.mutate()}
              >
                {refresh.isSuccess ? "Rewriting…" : "Refresh"}
              </button>
            </span>
          )}
        </div>
      </header>

      {persona.isError && (
        <p className="tm-pc-state" role="alert">Couldn’t load your document — try again.</p>
      )}

      {data?.status === "pending" && (
        <div className="tm-pc-state">
          <p>Myro is reading your evidence and writing this document…</p>
          {timeline.length === 0 && (
            <p className="tm-pc-hint">
              Nothing to write from yet?{" "}
              <Link href="/cv?view=stories">Drop your CV and stories</Link> — the document
              builds itself from there.
            </p>
          )}
        </div>
      )}

      {data?.status === "ready" &&
        MOVEMENTS.map((movement) => {
          const paragraphs = data.paragraphs.filter((p) => p.movement === movement.key)
          if (paragraphs.length === 0 && movement.key !== "future") return null
          return (
            <div className="tm-pc-movement" key={movement.key}>
              <Rail movement={movement.key} timeline={timeline} />
              <div className="tm-pc-prose">
                <div className="tm-pc-m-eyebrow">
                  <span className="tm-pc-numeral">{movement.numeral}</span>
                  <span className="tm-pc-m-title">{movement.title}</span>
                </div>
                {paragraphs.map((p) => (
                  <Paragraph key={p.id} token={token} paragraph={p} />
                ))}
                {movement.key === "future" && data.cosmos === "none" && (
                  <div className="tm-pc-constellation">
                    <p className="tm-pc-constellation-label">Second lens · unlit</p>
                    <p>
                      Your arc above is drawn from evidence alone. There is a second lens —
                      timing windows read from your birth chart — and it is currently dark.
                    </p>
                    <Link href="/myrology" className="cvb-btn primary sm">
                      Align with your cosmos
                    </Link>
                    <p className="tm-pc-fine">
                      Date, time and place of birth · asked once, with consent · the chart
                      times, it never overrides evidence.
                    </p>
                  </div>
                )}
                {movement.key === "future" && data.cosmos === "on_file" && (
                  <p className="tm-pc-cosmos-note">
                    ✦ Birth chart on file — your cosmos reading arrives with your Myrology
                    session, beside the evidence, never over it.
                  </p>
                )}
              </div>
            </div>
          )
        })}
    </section>
  )
}
