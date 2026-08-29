"use client"

/**
 * One slot, as a label and a row of chips.
 *
 * Replaces `<SlotGroup>`'s stack of full-width plates. The structure is
 * unchanged and deliberately so — the six slots are the Order's only real
 * hierarchy and the resolver owns which line sits in which — but a slot now
 * costs a label and a wrapping row instead of a column of cards:
 *
 *     empty slot   88px -> 26px   (label and invitation share one line)
 *     3-line slot 251px -> ~60px
 *
 * The add control is the LAST CHIP IN THE ROW rather than a band beneath it.
 * That is what collapses the empty case: "DRAWN TO  ( + something that pulls
 * you )" is one line, and three empty slots stop costing 264px of nothing.
 *
 * This component still knows only the WORDS. Which lines belong here, the
 * arity, and how full the slot is all arrive from the resolver's partition —
 * when the client worked them out too, its answer and the run's answer were
 * different ones (`Won't take · 15 of 6`).
 */

import { useEffect, useRef, useState } from "react"

import { SayPad } from "@/components/myro/say-pad"
import { LocationPicker } from "@/components/target-location/location-picker"
import { RoleFamilyPicker } from "@/components/target-role/role-family-picker"
import "@/components/target-role/role-family-picker.css"
import { slotCount, type SlotCopy } from "@/lib/preflight/slots"
import type { LineStatus, OrderConflict, OrderLine } from "@/lib/preflight/types"

import { Chip } from "./chip"
import { ConflictPlate } from "./conflict-plate"

export function ChipGroup({
  copy,
  arity,
  filled,
  lines,
  conflicts,
  allLines,
  busy,
  /** False on a step whose own title already says this slot's name — a header
   *  reading "The work" under a step titled "The work" is the label restated. */
  showLabel = true,
  onAdd,
  onAnswerLine,
  onRewordLine,
}: {
  copy: SlotCopy
  arity: number
  /** Placed + contested, from the resolver's partition — never a count of what
   *  happens to be rendered. */
  filled: number
  lines: OrderLine[]
  conflicts: OrderConflict[]
  /** Every line, so a conflict can resolve its own option text. */
  allLines: OrderLine[]
  busy?: boolean
  showLabel?: boolean
  onAdd: (kind: SlotCopy["addKind"], text: string, roleFamily?: string) => void
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
}) {
  const count = slotCount(arity, filled)
  /* An empty slot puts its label and its invitation on ONE line. Stacked, the
     two cost 56px to say six words — and the case the redesign exists for is
     an order with three empty slots, where that is 168px of nothing between
     the reader and the button. Filled groups keep the stack: a wrapping row of
     chips beside a label column would cramp a won't-take sentence at 375px. */
  const empty = lines.length === 0 && conflicts.length === 0

  return (
    <section className="pf-group" data-empty={empty ? "true" : undefined} aria-label={copy.label}>
      {showLabel ? (
        <div className="pf-group-head">
          <h3 className="pf-group-label">{copy.label}</h3>
          {count ? <span className="pf-group-count">{count}</span> : null}
        </div>
      ) : null}

      <div className="pf-chips">
        {lines.map((line) => (
          <Chip
            key={line.id}
            line={line}
            busy={busy}
            /* "a preference, not a hard line" inside DRAWN TO is the group's
               own label restated — and a wide chip costs its group 120px
               against 56. Under WON'T TAKE it is the only thing saying this
               one does not exclude, so it stays. */
            softNote={copy.addKind !== "lean"}
            onReword={(text) => onRewordLine(line.id, text)}
            onDrop={() => onAnswerLine(line.id, "dropped")}
          />
        ))}
        <SlotAdd
          copy={copy}
          busy={busy}
          onAdd={onAdd}
          chosen={lines.map((line) => line.text)}
        />
      </div>

      {/* A conflict is a statement about THIS slot's arity, so it stays beside
          it. Floating every conflict at the bottom of one list separated the
          question from the thing it was about. */}
      {conflicts.map((conflict) => (
        <ConflictPlate
          key={`${conflict.slot}:${conflict.line_ids.join(",")}`}
          conflict={conflict}
          lines={allLines}
          busy={busy}
          onDrop={(id) => onAnswerLine(id, "dropped")}
        />
      ))}
    </section>
  )
}

/**
 * Add straight into this slot.
 *
 * No proposals round trip and no LLM turn: the user picked the slot by picking
 * which "+" they pressed, so the kind is already known. Deterministic, instant
 * and free — the conversational path exists for the case where they have a
 * sentence rather than a line.
 */
const REMOTE_LOCATION = ["Remote"]

function SlotAdd({
  copy,
  busy,
  onAdd,
  chosen,
}: {
  copy: SlotCopy
  busy?: boolean
  onAdd: (kind: SlotCopy["addKind"], text: string, roleFamily?: string) => void
  chosen: string[]
}) {
  // The work is chosen, not typed — the same corpus picker Settings, the Jobs
  // filter and the score header use. A title typed here produced a role the
  // user could see and a `target_roles` scoping key that stayed stale, because
  // a family cannot be recovered from free text.
  if (copy.addKind === "role") {
    return (
      <RoleFamilyPicker
        label={copy.invite}
        busy={busy}
        onChoose={(role) => onAdd("role", role.label, role.family)}
      />
    )
  }
  // Where is the same class of choice: a city in the live corpus, not a
  // sentence. Free text here meant "Gurgaon" never resolved to the catalog
  // name the matcher stores.
  if (copy.addKind === "location") {
    return (
      <LocationPicker
        label={copy.invite}
        busy={busy}
        chosen={chosen}
        extras={REMOTE_LOCATION}
        onChoose={(location) => onAdd("location", location)}
      />
    )
  }
  return <SlotAddText copy={copy} busy={busy} onAdd={onAdd} />
}

function SlotAddText({
  copy,
  busy,
  onAdd,
}: {
  copy: SlotCopy
  busy?: boolean
  onAdd: (kind: SlotCopy["addKind"], text: string, roleFamily?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) { setDraft(""); setOpen(false) }
    }
    document.addEventListener("mousedown", outside)
    return () => document.removeEventListener("mousedown", outside)
  }, [open])

  function commit() {
    const text = draft.trim()
    if (text) onAdd(copy.addKind, text)
    setDraft("")
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="pf-chip-add tm-control-focus"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        {copy.invite}
      </button>
    )
  }

  return (
    <div ref={ref} className="pf-chip-add-open">
      <SayPad
        size="compact"
        value={draft}
        maxLength={240}
        autoFocus
        onChange={setDraft}
        onSubmit={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); setDraft(""); setOpen(false) }
        }}
        aria-label={`Add to ${copy.label}`}
        placeholder={copy.invite}
      />
      <div className="pf-chip-add-actions">
        <button
          type="button"
          className="pf-plate-action"
          data-role="cancel"
          onClick={() => { setDraft(""); setOpen(false) }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="pf-plate-action"
          data-role="save"
          onClick={commit}
          disabled={!draft.trim() || busy}
        >
          Add
        </button>
      </div>
    </div>
  )
}
