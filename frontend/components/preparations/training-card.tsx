"use client"

/**
 * TrainingCard — Finlatics programs in the workspace peek rail.
 * Same card frame as Collections (icon head · stacked chips · teal footer).
 * Course chips are louder than Followed companies: these are the action.
 */

import { BookOpen, ArrowRight, ExternalLink } from "lucide-react"
import {
  FINLATICS_PROGRAMS,
  finlaticsHomeHref,
  finlaticsHref,
} from "@/lib/finlatics-programs"

export function TrainingCard() {
  return (
    <section className="mc-peek-card" aria-labelledby="prp-train-title">
      <header className="mc-peek-head">
        <span className="mc-peek-ico" aria-hidden><BookOpen size={15} /></span>
        <h3 id="prp-train-title" className="mc-peek-title">Training</h3>
      </header>
      <div className="prp-courses">
        {FINLATICS_PROGRAMS.map((program) => (
          <a
            key={program.id}
            className="prp-course tm-control-focus"
            href={finlaticsHref(program)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="prp-course-mark" aria-hidden>{program.mark}</span>
            <span className="prp-course-name">{program.title}</span>
            <ExternalLink size={13} aria-hidden />
          </a>
        ))}
      </div>
      <a
        className="mc-peek-link tm-control-focus"
        href={finlaticsHomeHref()}
        target="_blank"
        rel="noopener noreferrer"
      >
        Finlatics <ArrowRight size={13} aria-hidden />
      </a>
    </section>
  )
}
