"use client"

/**
 * TrainingCard — Finlatics programs on the preparations workspace rail.
 * Same peek-card frame as Jobs / Collections. Outbound Apply URLs with src
 * rewritten to myroref.
 */

import { BookOpen, ExternalLink } from "lucide-react"
import { FINLATICS_PROGRAMS, finlaticsHref } from "@/lib/finlatics-programs"

export function TrainingCard() {
  return (
    <section className="mc-peek-card" aria-labelledby="prp-train-title">
      <header className="mc-peek-head">
        <span className="mc-peek-ico" aria-hidden><BookOpen size={15} /></span>
        <h3 id="prp-train-title" className="mc-peek-title">Training</h3>
      </header>
      <p className="mc-peek-intel">Finlatics</p>
      <div className="mc-peek-body">
        {FINLATICS_PROGRAMS.map((program) => (
          <a
            key={program.id}
            className="mc-peek-gap prp-train-row"
            href={finlaticsHref(program)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="lab">{program.title}</span>
            <ExternalLink size={12} aria-hidden />
          </a>
        ))}
      </div>
    </section>
  )
}
