"use client"

/**
 * TrainingCard — Finlatics programs on the /preparations rail, under Score map.
 * Outbound links only: their landing Apply URLs with src rewritten to myroref.
 */

import { BookOpen, ExternalLink } from "lucide-react"
import { FINLATICS_PROGRAMS, finlaticsHref } from "@/lib/finlatics-programs"

export function TrainingCard() {
  return (
    <section className="prp-map prp-train" aria-labelledby="prp-train-title">
      <div className="prp-map-head">
        <span className="prp-map-ico" aria-hidden><BookOpen size={15} /></span>
        <div>
          <h2 id="prp-train-title" className="prp-map-title">Training</h2>
          <p className="prp-train-by">Finlatics</p>
        </div>
      </div>
      <ul className="prp-train-list">
        {FINLATICS_PROGRAMS.map((program) => (
          <li key={program.id}>
            <a
              className="prp-train-row"
              href={finlaticsHref(program)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="prp-train-name">{program.title}</span>
              <ExternalLink size={12} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
