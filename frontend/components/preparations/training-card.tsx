"use client"

/**
 * TrainingCard — the three Finlatics programmes this user's rooms argue for
 * (Unified Prep v2, artboard 2b; the rail's bottom block).
 *
 * It used to list all eleven, in catalogue order, identical for every user —
 * a banner. Now the server picks three from the skill gaps the ladder already
 * resolved, and each card carries the `why` naming the level it covers and the
 * rooms that asked. The `why` is the product; without it this is an ad.
 *
 * The blurb no longer hides behind a disclosure. The design puts it on the
 * card, and a row the reader must open to learn anything is a row they skip.
 *
 * A card opens its programme in the main column, Finlatics' own card included
 * (2026-10-10). "All 11" used to leave for finlatics.com; it now expands the
 * no-rooms picker's list here, so every programme opens the same way.
 */

import { useState } from "react"
import Image from "next/image"
import { ChevronDown, ExternalLink } from "lucide-react"
import type { TrainingMatch } from "@/lib/api"
import {
  FINLATICS_APPLY_LABEL,
  FINLATICS_BRAND_LABEL,
  FINLATICS_LOGO_SRC,
  FINLATICS_PROGRAMS,
  type FinlaticsProgram,
  finlaticsHref,
} from "@/lib/finlatics-programs"
import { TrainingList, shelfRows } from "./training-shelf"
import "./training-card.css"

const BY_ID = new Map(FINLATICS_PROGRAMS.map((p) => [p.id, p]))

/** Catalogue order, used only when the ladder has not answered yet. */
const FALLBACK: TrainingMatch[] = FINLATICS_PROGRAMS.slice(0, 3).map((p) => ({
  program_id: p.id,
  why: null,
  matched: false,
}))

export function TrainingCard({
  matches,
  note,
  selectedId,
  onSelect,
}: {
  matches?: TrainingMatch[]
  note: string | null
  /** The programme open in the main column, if any. */
  selectedId: string | null
  onSelect: (programId: string) => void
}) {
  const [all, setAll] = useState(false)
  const rows = (matches?.length ? matches : FALLBACK)
    .map((match) => ({ match, program: BY_ID.get(match.program_id) }))
    .filter((row): row is { match: TrainingMatch; program: FinlaticsProgram } => !!row.program)

  return (
    <section className="prp-stand prp-train" aria-labelledby="prp-train-title">
      <header className="prp-train-lockup">
        <Image src={FINLATICS_LOGO_SRC} alt="" width={24} height={24} />
        <h3 id="prp-train-title">{FINLATICS_BRAND_LABEL}</h3>
        <button
          type="button"
          className="prp-train-all tm-link tm-control-focus"
          aria-expanded={all}
          aria-controls="prp-train-list"
          onClick={() => setAll((open) => !open)}
        >
          All {FINLATICS_PROGRAMS.length} <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
        </button>
      </header>
      {note ? <p className="prp-train-note">{note}</p> : null}
      {all ? (
        <TrainingList
          id="prp-train-list"
          rows={shelfRows(matches)}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <div className="prp-courses" id="prp-train-list">
          {rows.map(({ match, program }) => (
            <TrainingCourse
              key={program.id}
              program={program}
              why={match.why}
              matched={match.matched}
              open={program.id === selectedId}
              onOpen={() => onSelect(program.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TrainingCourse({
  program,
  why,
  matched,
  open,
  onOpen,
}: {
  program: FinlaticsProgram
  why: string | null
  matched: boolean
  open: boolean
  onOpen: () => void
}) {
  return (
    <article
      className={matched ? "prp-course is-matched" : "prp-course"}
      data-open={open ? "true" : undefined}
    >
      <button
        type="button"
        className="prp-course-open tm-control-focus"
        aria-current={open ? "true" : undefined}
        onClick={onOpen}
      >
        <span className="prp-course-head">
          <span className="prp-course-mark" aria-hidden>{program.mark}</span>
          <span className="prp-course-name">{program.title}</span>
        </span>
        {why ? (
          <span className="prp-course-why">
            <span className="prp-course-dot" aria-hidden />
            {why}
          </span>
        ) : null}
        <span className="prp-course-blurb">{program.blurb}</span>
      </button>
      <a
        className="prp-course-apply tm-link tm-control-focus"
        href={finlaticsHref(program)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {FINLATICS_APPLY_LABEL} <ExternalLink size={12} aria-hidden />
      </a>
    </article>
  )
}
