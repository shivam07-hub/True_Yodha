"use client"

/**
 * TrainingCard — Finlatics programs in the Prep standing column.
 * The row is a disclosure, not a link. Hover (fine pointer) or click opens
 * the program blurb; Apply on Finlatics is the only outbound control.
 */

import { useState } from "react"
import Image from "next/image"
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
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

export function TrainingCard() {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="prp-stand" aria-labelledby="prp-train-title">
      <header className="prp-train-lockup">
        <Image src={FINLATICS_LOGO_SRC} alt="" width={26} height={26} />
        <h3 id="prp-train-title">{FINLATICS_BRAND_LABEL}</h3>
      </header>
      <div className="prp-courses">
        {FINLATICS_PROGRAMS.map((program) => (
          <TrainingCourse
            key={program.id}
            program={program}
            open={openId === program.id}
            onToggle={() => setOpenId((id) => (id === program.id ? null : program.id))}
          />
        ))}
      </div>
      <a
        className="prp-stand-more tm-control-focus"
        href={finlaticsHomeHref()}
        target="_blank"
        rel="noopener noreferrer"
      >
        All programs <ArrowRight size={13} aria-hidden />
      </a>
    </section>
  )
}

function TrainingCourse({
  program,
  open,
  onToggle,
}: {
  program: FinlaticsProgram
  open: boolean
  onToggle: () => void
}) {
  const panelId = `prp-course-panel-${program.id}`
  const Chevron = open ? ChevronUp : ChevronDown

  return (
    <article className={open ? "prp-course is-open" : "prp-course"}>
      <button
        type="button"
        className="prp-course-toggle tm-control-focus"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="prp-course-mark" aria-hidden>{program.mark}</span>
        <span className="prp-course-name">{program.title}</span>
        <Chevron size={13} aria-hidden />
      </button>
      <div className="prp-course-panel" id={panelId}>
        <p className="prp-course-blurb">{program.blurb}</p>
        <a
          className="prp-course-apply tm-link tm-control-focus"
          href={finlaticsHref(program)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {FINLATICS_APPLY_LABEL} <ExternalLink size={13} aria-hidden />
        </a>
      </div>
    </article>
  )
}
