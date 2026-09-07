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
 */

import Image from "next/image"
import { ArrowRight, ExternalLink } from "lucide-react"
import type { TrainingMatch } from "@/lib/api"
import {
  FINLATICS_APPLY_LABEL,
  FINLATICS_BRAND_LABEL,
  FINLATICS_LOGO_SRC,
  FINLATICS_PROGRAMS,
  type FinlaticsProgram,
  finlaticsHomeHref,
  finlaticsHref,
} from "@/lib/finlatics-programs"
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
}: {
  matches?: TrainingMatch[]
  note?: string
}) {
  const rows = (matches?.length ? matches : FALLBACK)
    .map((match) => ({ match, program: BY_ID.get(match.program_id) }))
    .filter((row): row is { match: TrainingMatch; program: FinlaticsProgram } => !!row.program)

  return (
    <section className="prp-stand prp-train" aria-labelledby="prp-train-title">
      <header className="prp-train-lockup">
        <Image src={FINLATICS_LOGO_SRC} alt="" width={24} height={24} />
        <h3 id="prp-train-title">{FINLATICS_BRAND_LABEL}</h3>
        <a
          className="prp-train-all tm-link tm-control-focus"
          href={finlaticsHomeHref()}
          target="_blank"
          rel="noopener noreferrer"
        >
          All {FINLATICS_PROGRAMS.length} <ArrowRight size={12} aria-hidden />
        </a>
      </header>
      {note ? <p className="prp-train-note">{note}</p> : null}
      <div className="prp-courses">
        {rows.map(({ match, program }) => (
          <TrainingCourse key={program.id} program={program} why={match.why} matched={match.matched} />
        ))}
      </div>
    </section>
  )
}

function TrainingCourse({
  program,
  why,
  matched,
}: {
  program: FinlaticsProgram
  why: string | null
  matched: boolean
}) {
  return (
    <article className={matched ? "prp-course is-matched" : "prp-course"}>
      <div className="prp-course-head">
        <span className="prp-course-mark" aria-hidden>{program.mark}</span>
        <span className="prp-course-name">{program.title}</span>
      </div>
      {why ? (
        <p className="prp-course-why">
          <span className="prp-course-dot" aria-hidden />
          {why}
        </p>
      ) : null}
      <p className="prp-course-blurb">{program.blurb}</p>
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
