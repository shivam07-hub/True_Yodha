"use client"

/**
 * One step of the journey — a title, a line saying what it is for, the slots
 * it edits, and any guess that belongs to those slots.
 *
 * The guesses are the part worth naming. They used to live in one fold at the
 * bottom of the canvas ("14 things Myro heard"), so a question about a city
 * and the Where slot it was about were never on screen together — the user had
 * to hold the question in their head while scrolling back up to see what it
 * would change. Routed by kind, each one now renders under the slot it edits.
 */

import type { LineSource, LineStatus, OrderLine, OrderProposal } from "@/lib/preflight/types"
import type { StepGroup } from "@/lib/preflight/derive"
import type { StepDef } from "@/lib/preflight/journey"
import type { SlotCopy } from "@/lib/preflight/slots"

import { StepHead } from "@/components/journey/journey-chrome"

import { Chip } from "./chip"
import { ChipGroup } from "./chip-group"
import { HeardRow } from "./heard-row"
import { MyroTyping } from "./typing"

type Verdict = "kept" | "dropped" | null

/**
 * The remembering, said once per step instead of twenty times.
 *
 * The chip's rail already says user-authored vs Myro-guessed, so repeating
 * that in words under every step would be the rail restated — the exact defect
 * the plate's meta line was cut for. What the rail CANNOT say is where a guess
 * came FROM and how much there was of it, and that is the whole reason a
 * returning user should feel known rather than re-interviewed.
 */
export function recallLine(
  lines: OrderLine[],
  memoryCount: number,
): string | null {
  const sources = new Set<LineSource>(lines.map((l) => l.source))
  const fromCv = sources.has("from_cv")
  const inferred = sources.has("myro_inferred")
  if (!fromCv && !inferred) return null
  const parts: string[] = []
  if (fromCv) parts.push("your CV")
  if (inferred) parts.push(memoryCount > 0 ? `${memoryCount} notes you've left` : "what you've told Myro")
  return `Filled from ${parts.join(" and ")}. Change anything that has moved.`
}

export function StepSlot({
  step,
  groups,
  memoryCount,
  guesses,
  proposals,
  proposalAnswers,
  facts,
  busy,
  onAdd,
  onAnswerLine,
  onRewordLine,
  onAnswerProposal,
}: {
  step: StepDef
  groups: StepGroup[]
  memoryCount: number
  /** Unanswered lines whose kind routes to this step. */
  guesses: OrderLine[]
  /** Proposals from the last mentor turn that route to this step. */
  proposals: OrderProposal[]
  proposalAnswers: Record<string, Verdict>
  /** Kept lines the resolver files to no slot — a notice period, a visa
   *  status. True of the person, actionable by nobody, so they cost no slot
   *  budget. Shown on About you, never run, never deleted. */
  facts?: OrderLine[]
  busy?: boolean
  onAdd: (kind: SlotCopy["addKind"], text: string, roleFamily?: string) => void
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
  onAnswerProposal: (id: string, verdict: Verdict) => void
}) {
  const placed = groups.flatMap((g) => g.lines)
  const recall = recallLine(placed, memoryCount)
  const single = groups.length === 1
  const asks = guesses.length + proposals.length

  return (
    <div className="pf-step">
      <StepHead recall={recall} title={step.title} lede={step.lede} />

      <div className="pf-step-body">
        {groups.map((group) => (
          <ChipGroup
            key={group.copy.label}
            copy={group.copy}
            arity={group.arity}
            filled={group.filled}
            lines={group.lines}
            conflicts={group.conflicts}
            allLines={placed}
            busy={busy}
            /* A step editing ONE slot is already titled with that slot's name;
               a header repeating it underneath is the title restated. */
            showLabel={!single}
            onAdd={onAdd}
            onAnswerLine={onAnswerLine}
            onRewordLine={onRewordLine}
          />
        ))}

        {facts && facts.length > 0 ? (
          <section className="pf-group" aria-label="Not a filter">
            <div className="pf-group-head">
              <h3 className="pf-group-label">Not a filter</h3>
            </div>
            <div className="pf-chips">
              {facts.map((line) => (
                <FactChip
                  key={line.id}
                  line={line}
                  busy={busy}
                  onAnswerLine={onAnswerLine}
                  onRewordLine={onRewordLine}
                />
              ))}
            </div>
          </section>
        ) : null}

        {busy ? <MyroTyping label="Myro is reading that" /> : null}

        {asks > 0 ? (
          <section className="pf-asks" aria-label="Waiting on you">
            <div className="pf-group-head">
              <h3 className="pf-group-label">
                {asks === 1 ? "One to answer" : `${asks} to answer`}
              </h3>
            </div>
            {proposals.map((p) => (
              <HeardRow
                key={p.id}
                text={p.value}
                sourceNote={p.why}
                answered={proposalAnswers[p.id] ?? null}
                onAnswer={(verdict) => onAnswerProposal(p.id, verdict)}
              />
            ))}
            {guesses.map((line) => (
              <HeardRow
                key={line.id}
                text={line.text}
                source={line.source}
                sourceNote={line.source_note}
                answered={null}
                disableYes={line.unusable}
                onAnswer={(verdict) => onAnswerLine(line.id, verdict === "kept" ? "kept" : "dropped")}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}

/** A fact renders as a chip like any other line — editable, droppable, and
 *  filling no slot. */
function FactChip({
  line, busy, onAnswerLine, onRewordLine,
}: {
  line: OrderLine
  busy?: boolean
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
}) {
  return (
    <Chip
      line={line}
      busy={busy}
      onReword={(text) => onRewordLine(line.id, text)}
      onDrop={() => onAnswerLine(line.id, "dropped")}
    />
  )
}
