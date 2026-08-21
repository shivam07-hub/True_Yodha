"use client"

/**
 * One of the six slots, with everything that belongs to it.
 *
 * The group header is the hierarchy device the flat canvas was missing. Six
 * of them — one per slot — rather than the twenty per-row kind labels that
 * shipped and were rightly cut: a label above every statement is noise, a
 * label above every GROUP is structure.
 *
 * An empty slot still renders. That is the point: the modal's real question is
 * "what does Myro still need from me?", and six headers with three of them
 * holding only an invitation answers it at a glance. A group that disappears
 * when empty cannot.
 *
 * A conflict lives INSIDE its slot, because a conflict IS a statement about
 * that slot's arity. Floating them all at the bottom of one flat list — which
 * is what shipped — separated the question from the thing it was about.
 */

import { useEffect, useRef, useState } from "react"

import { SayPad } from "@/components/myro/say-pad"
import { slotCount, type SlotSpec } from "@/lib/preflight/slots"
import type { LineStatus, OrderConflict, OrderLine } from "@/lib/preflight/types"

import { ConflictPlate } from "./conflict-plate"
import { Plate } from "./plate"

export function SlotGroup({
  spec,
  lines,
  conflicts,
  allLines,
  busy,
  onAdd,
  onAnswerLine,
  onRewordLine,
}: {
  spec: SlotSpec
  /** Kept, uncontested lines filed to this slot. */
  lines: OrderLine[]
  /** Live conflicts whose slot is this one. */
  conflicts: OrderConflict[]
  /** Every line, so a conflict can resolve its own option text. */
  allLines: OrderLine[]
  busy?: boolean
  onAdd: (kind: SlotSpec["addKind"], text: string) => void
  onAnswerLine: (lineId: string, status: LineStatus) => void
  onRewordLine: (lineId: string, text: string) => void
}) {
  const contested = conflicts.reduce((n, c) => n + c.line_ids.length, 0)
  const count = slotCount(spec, lines.length + contested)

  return (
    <section className="pf-slot" aria-label={spec.label}>
      <div className="pf-slot-head">
        <h3 className="pf-slot-label">{spec.label}</h3>
        {count ? <span className="pf-slot-count">{count}</span> : null}
      </div>

      {lines.map((line) => (
        <Plate
          key={line.id}
          line={line}
          busy={busy}
          onReword={(text) => onRewordLine(line.id, text)}
          onDrop={() => onAnswerLine(line.id, "dropped")}
        />
      ))}

      {conflicts.map((conflict) => (
        <ConflictPlate
          key={`${conflict.slot}:${conflict.line_ids.join(",")}`}
          conflict={conflict}
          lines={allLines}
          busy={busy}
          onDrop={(id) => onAnswerLine(id, "dropped")}
        />
      ))}

      <SlotAdd spec={spec} busy={busy} onAdd={onAdd} />
    </section>
  )
}

/**
 * Add straight into this slot.
 *
 * No proposals round trip: the user chose the slot by choosing which "+" they
 * pressed, so there is nothing left to infer. `addLine` takes the kind
 * directly, which makes this deterministic and free — the conversational path
 * exists for the case where the user has a sentence rather than a line.
 */
function SlotAdd({
  spec,
  busy,
  onAdd,
}: {
  spec: SlotSpec
  busy?: boolean
  onAdd: (kind: SlotSpec["addKind"], text: string) => void
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
    if (text) onAdd(spec.addKind, text)
    setDraft("")
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="pf-slot-add tm-control-focus"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        {spec.invite}
      </button>
    )
  }

  return (
    <div ref={ref} className="pf-slot-add pf-slot-add-open">
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
        aria-label={`Add to ${spec.label}`}
        placeholder={spec.invite}
      />
      <div className="pf-slot-add-actions">
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
