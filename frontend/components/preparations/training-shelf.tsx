"use client"

/**
 * TrainingShelf — Prep with no rooms (locked with Shivam 2026-09-28, option C).
 *
 * With no rooms the rail had nothing to list and the main column held one
 * dashed box. The Finlatics catalogue takes the rooms' place, in the rooms'
 * shape: the rail lists the eleven programmes, the main column shows the one
 * picked. Programmes that cover a gap in the target band come first, split
 * from the rest by a rule — the picked one's `why` says what the rule meant.
 *
 * With rooms, the same detail opens from the rail's Training block, and the
 * same list is what "All 11" expands to (2026-10-10). The detail carries
 * Finlatics' own programme card, one page of their info-card PDF, under the
 * photo: the modules are theirs to state, so we show their page, not a retype.
 *
 * The match is `/career-skill-path` → `training`, the read the Skill path block
 * on this screen already makes. This component asks for nothing of its own.
 */

import Image from "next/image"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import type { TrainingMatch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  FINLATICS_APPLY_LABEL,
  FINLATICS_BRAND_LABEL,
  FINLATICS_CARD_SIZE,
  FINLATICS_LOGO_SRC,
  FINLATICS_PROGRAMS,
  type FinlaticsProgram,
  finlaticsCardSrc,
  finlaticsHref,
  finlaticsPhotoSrc,
} from "@/lib/finlatics-programs"
import "./training-shelf.css"

export type ShelfRow = { program: FinlaticsProgram; why: string | null }

const BY_ID = new Map(FINLATICS_PROGRAMS.map((p) => [p.id, p]))

/** Matched programmes in the server's order, then the rest in catalogue order. */
export function shelfRows(matches: TrainingMatch[] | undefined): ShelfRow[] {
  const matched = (matches ?? []).flatMap((match) => {
    const program = match.matched ? BY_ID.get(match.program_id) : undefined
    return program ? [{ program, why: match.why }] : []
  })
  const taken = new Set(matched.map((row) => row.program.id))
  const rest = FINLATICS_PROGRAMS.filter((p) => !taken.has(p.id)).map((program) => ({
    program,
    why: null,
  }))
  return [...matched, ...rest]
}

export function TrainingPicker({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ShelfRow[]
  selectedId: string | null
  onSelect: (programId: string) => void
}) {
  return (
    <section className="prp-shelf" aria-labelledby="prp-shelf-title">
      <header className="prp-train-lockup">
        <Image src={FINLATICS_LOGO_SRC} alt="" width={24} height={24} />
        <h3 id="prp-shelf-title">{FINLATICS_BRAND_LABEL}</h3>
      </header>
      <TrainingList rows={rows} selectedId={selectedId} onSelect={onSelect} />
    </section>
  )
}

/** The eleven, matched run first. The no-rooms picker and the rooms rail's
 *  "All 11" are this one list. */
export function TrainingList({
  id,
  rows,
  selectedId,
  onSelect,
}: {
  id?: string
  rows: ShelfRow[]
  selectedId: string | null
  onSelect: (programId: string) => void
}) {
  return (
    <div className="prp-shelf-list" id={id}>
      {rows.map(({ program, why }, index) => (
        <button
          key={program.id}
          type="button"
          className="prp-shelf-row tm-control-focus"
          data-matched={why ? "true" : undefined}
          // The first unmatched row after a matched run draws the rule.
          data-after-match={!why && index > 0 && rows[index - 1].why ? "true" : undefined}
          aria-current={program.id === selectedId ? "true" : undefined}
          onClick={() => onSelect(program.id)}
        >
          <span className="prp-shelf-mark" aria-hidden>{program.mark}</span>
          <span className="prp-shelf-name">{program.title}</span>
        </button>
      ))}
    </div>
  )
}

/** No rooms: the loop's next step sits above the programme. */
export function NoRoomsDoor() {
  return (
    <div className="prp-door">
      <p>
        <strong>No rooms yet.</strong> Apply to a job and its room opens here.
      </p>
      <Button nativeButton={false} size="sm" render={<Link href="/collections" />}>
        Open Collections
      </Button>
    </div>
  )
}

export function TrainingDetail({ row }: { row: ShelfRow }) {
  const { program, why } = row
  const href = finlaticsHref(program)
  return (
    <article className="prp-program" aria-labelledby="prp-program-title">
      <Image
        key={program.id}
        className="prp-program-photo"
        src={finlaticsPhotoSrc(program)}
        alt=""
        width={1080}
        height={560}
        sizes="(max-width: 980px) 100vw, 820px"
      />
      <div className="prp-program-body">
        <p className="prp-program-kicker">
          <Image src={FINLATICS_LOGO_SRC} alt="" width={16} height={16} />
          {FINLATICS_BRAND_LABEL}
        </p>
        <h2 id="prp-program-title">{program.title}</h2>
        {why ? <p className="prp-program-why">{why}</p> : null}
        <p className="prp-program-blurb">{program.blurb}</p>
        <Button
          nativeButton={false}
          variant="outline"
          className="prp-program-apply"
          render={<a href={href} target="_blank" rel="noopener noreferrer" />}
        >
          {FINLATICS_APPLY_LABEL} <ExternalLink aria-hidden strokeWidth={1.5} />
        </Button>
      </div>
      {/* Their card prints its own APPLY NOW, so the whole card is that link. */}
      <a
        className="prp-program-card tm-control-focus"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image
          key={program.id}
          src={finlaticsCardSrc(program)}
          alt={`${program.title}: core learning modules. ${FINLATICS_APPLY_LABEL}`}
          width={FINLATICS_CARD_SIZE.width}
          height={FINLATICS_CARD_SIZE.height}
          sizes="(max-width: 980px) 100vw, 820px"
        />
      </a>
    </article>
  )
}
