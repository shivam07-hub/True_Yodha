"use client"

/**
 * Step 2's detail: the levels this job tests, and where the user actually is
 * (Unified Prep v2, artboard 2b).
 *
 * The rungs are the honest part. L1-L5, filled to the level the user holds,
 * outlined up to the level the job asks for, faint above it — so "You're L1 ·
 * this job asks L3" is visible before it is read.
 *
 * A skill with no assessment says so and offers a path request, never a drill
 * CTA Myro cannot honour ([[project_united_learning_loop]]).
 */

import Link from "next/link"
import type { LevelRow } from "@/lib/api"

const LADDER = [1, 2, 3, 4, 5]

function stateLine(row: LevelRow): string {
  if (!row.has_drill) return "No assessment exists yet"
  if (row.held >= row.required) return `You're L${row.held} · this job asks L${row.required}`
  if (row.held === 0) return `No level yet · this job asks L${row.required}`
  return `You're L${row.held} · this job asks L${row.required}`
}

function rungState(rung: number, row: LevelRow): "held" | "asked" | "beyond" {
  // No assessment means no ladder to climb. Drawing rungs up to the required
  // level would show a target Myro cannot let anyone reach.
  if (!row.has_drill) return "beyond"
  if (rung <= row.held) return "held"
  if (rung <= row.required) return "asked"
  return "beyond"
}

/** The level the card's CTA starts at — the FIRST open row's, not the lowest.
 *  The server sorts deepest-gap-first, and the card must name the same level
 *  as the button on the row it sits above; two labels disagreeing about which
 *  drill you are about to start is worse than no label. */
export function nextLevel(rows: LevelRow[]): number | null {
  const open = rows.find((r) => r.has_drill && r.held < r.required)
  return open ? Math.min(open.held + 1, open.required) : null
}

export function LevelRows({ rows }: { rows: LevelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="prp-quiet">
        This job lists no levelled skills, so there is no gap to close here.
      </p>
    )
  }
  return (
    <div className="prp-levels">
      {rows.map((row) => (
        <div className="prp-level" key={row.name}>
          <span className="prp-level-copy">
            <span className="prp-level-name">{row.name}</span>
            <span className="prp-level-state">{stateLine(row)}</span>
          </span>
          <span className="prp-level-rungs" aria-hidden>
            {LADDER.map((rung) => (
              <span key={rung} data-state={rungState(rung, row)}>L{rung}</span>
            ))}
          </span>
          {row.has_drill ? (
            row.held >= row.required ? (
              <span className="prp-level-met">met</span>
            ) : (
              <Link
                href={`/practice?skill=${encodeURIComponent(row.name)}`}
                className="prp-level-cta tm-control-focus"
              >
                Start L{Math.min(row.held + 1, row.required)}
              </Link>
            )
          ) : (
            <Link href="/skills" className="prp-level-cta is-ghost tm-control-focus">
              Request path
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
