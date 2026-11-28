"use client"

/**
 * RoleRoom — the target-role room (ARCHITECTURE_ONE_PREP.md P1).
 *
 * The same four steps as a job room, read from the role instead of a JD:
 * step 1 is the role's skills your CV or practice already shows, step 2 the
 * levels it asks. Rehearsal and the brief are built from a job's requirements,
 * so they stay shut here and point at the jobs that fit.
 *
 * Every number comes from `GET /career-skill-path` (`role-room-model.ts`); this
 * component asks for nothing of its own.
 */

import * as React from "react"
import Link from "next/link"
import { CompanyAvatar } from "@/components/cv/builder/library-shared"
import { SENIORITY_LABEL, type SkillPathCard } from "@/lib/career-skill-path"
import { STEP_LABELS } from "./prep-model"
import { ReadinessRing } from "./prep-room"
import { LevelRows, nextLevel } from "./level-rows"
import { StepCard } from "./step-card"
import { bandLine, type RoleRoom as RoleRoomData } from "./role-room-model"

const EVIDENCE: Record<SkillPathCard["state"], { glyph: string; cls: string; label: string }> = {
  on_cv: { glyph: "●", cls: "covered", label: "On your CV" },
  practised: { glyph: "◐", cls: "weak", label: "Practised" },
  not_evidenced: { glyph: "○", cls: "gap", label: "Not shown yet" },
}

/** Shown first: what is missing, then what practice proved, then the CV. */
const EVIDENCE_ORDER: SkillPathCard["state"][] = ["not_evidenced", "practised", "on_cv"]

function RoleEvidence({ cards }: { cards: SkillPathCard[] }) {
  if (cards.length === 0) {
    return <p className="prp-quiet">No live jobs at this level name their skills yet.</p>
  }
  const ordered = [...cards].sort(
    (a, b) => EVIDENCE_ORDER.indexOf(a.state) - EVIDENCE_ORDER.indexOf(b.state),
  )
  return (
    <div>
      {ordered.map((card) => {
        const mark = EVIDENCE[card.state]
        const asked = card.demand
          ? `${card.demand.skill_job_count} of ${card.demand.band_job_count} jobs ask for it`
          : null
        return (
          <div key={card.taxonomy_key} className="prp-req">
            <span className={`prp-req-marker ${mark.cls}`} aria-hidden>{mark.glyph}</span>
            <div className="prp-req-main">
              <div className="prp-req-text">{card.display_name}</div>
              <div className="prp-req-story">
                {card.state === "on_cv" && card.evidence_pointer
                  ? <>&ldquo;{card.evidence_pointer}&rdquo;</>
                  : asked}
              </div>
            </div>
            <span className="prp-req-banked">{mark.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function NeedsAJob({ what }: { what: string }) {
  return (
    <p className="prp-quiet">
      {what}{" "}
      <Link href="/market" className="tm-link tm-control-focus">Find a job →</Link>
    </p>
  )
}

export function RoleRoom({
  room,
  initialStep = null,
}: {
  room: RoleRoomData
  /** `?step=N` — the step a link asked to open. */
  initialStep?: number | null
}) {
  const steps = room.steps
  const current = room.current_step
  const fallback = React.useMemo(
    () => new Set([initialStep ? initialStep - 1 : current - 1]),
    [initialStep, current],
  )
  const [opened, setOpened] = React.useState<ReadonlySet<number> | null>(null)
  const open = opened ?? fallback
  function toggleStep(index: number) {
    setOpened((prev) => {
      const next = new Set(prev ?? fallback)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const startAt = nextLevel(room.levels)
  const subs = [
    room.evidence.total > 0
      ? `${room.evidence.answered} of ${room.evidence.total} skills this role asks for already show`
      : "The skills this role asks for, against your CV and practice",
    "The levels this role asks for, and where you actually are",
    "Your answers to a job's requirements, asked back as interview questions",
    "One page for the day: lead-with stories, likely questions, a plan",
  ]
  const bodies = [
    <RoleEvidence key="e" cards={room.cards} />,
    <LevelRows key="l" rows={room.levels} />,
    <NeedsAJob key="r" what="Rehearsal is built from a job's requirements." />,
    <NeedsAJob key="b" what="The brief is written for one job." />,
  ]
  const level = room.seniority ? SENIORITY_LABEL[room.seniority] : null

  return (
    <div className="prp-room">
      <div className="prp-room-head">
        <CompanyAvatar name={room.title} size={40} />
        <div className="prp-room-title">
          <h1 className="prp-room-role">{room.title}</h1>
          <p className="prp-room-company">
            Your target role{level ? ` · ${level}` : ""}
            {room.jobCount ? ` · read from ${room.jobCount} live jobs` : ""}
          </p>
        </div>
      </div>

      <div className="prp-band">
        <ReadinessRing pct={room.pct} />
        <div className="prp-band-copy">
          <div className="prp-band-kicker">Ready for this role</div>
          <div className="prp-band-line">{bandLine(steps, current)}</div>
          <div className="prp-band-sub">
            Same four steps as every job room — <b>what you clear here carries</b>.
          </div>
        </div>
        <div className="prp-band-pips">
          {STEP_LABELS.map((label, i) => (
            <span className="prp-band-pip" key={label}>
              <span className="prp-band-pip-n" data-state={steps[i] ?? 0}>{i + 1}</span>
              <span className="prp-band-pip-l" data-state={steps[i] ?? 0}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="prp-steps">
        {STEP_LABELS.map((label, i) => (
          <StepCard
            key={label}
            index={i}
            value={steps[i] ?? 0}
            currentStep={current}
            sub={subs[i]}
            count={i === 0 ? room.evidence : undefined}
            cta={i === 1 && startAt ? `Start L${startAt}` : i >= 2 ? "Open" : undefined}
            state={i >= 2 ? "needs a job" : undefined}
            open={open.has(i)}
            onToggle={() => toggleStep(i)}
          >
            {bodies[i]}
          </StepCard>
        ))}
      </div>
    </div>
  )
}
