"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The direction axis on step 2 — what you're drawn to, what you're not.
 *
 * These are clauses, not tags. "Avoids large corporations" is an answer to a
 * question about your career; "no-bigco" is a filter token. The ranker reads
 * them as language and the Targeting Brief renders them back into a sentence
 * the user reads, so the input has to accept a phrase.
 *
 * Myro's own reading arrives pre-filled and is labelled as a reading. A guess
 * shown as a decision is the thing that makes a user distrust everything else
 * on the screen — so when the value came from the CV, the row says so and the
 * user's first act is correction, not composition.
 */

const MAX_PHRASES = 6

type Props = {
  lean: string[]
  avoid: string[]
  /** Halves that are Myro's reading rather than the user's own answer. */
  proposed: Array<"avoid" | "lean">
  onChange: (next: { lean: string[]; avoid: string[] }) => void
}

function PhraseList({
  id, label, placeholder, values, onCommit,
}: {
  id: string
  label: string
  placeholder: string
  values: string[]
  onCommit: (next: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const full = values.length >= MAX_PHRASES

  function add() {
    const phrase = draft.trim().replace(/\s+/g, " ")
    if (!phrase) return
    if (values.some((value) => value.toLowerCase() === phrase.toLowerCase())) { setDraft(""); return }
    if (full) return
    onCommit([...values, phrase])
    setDraft("")
  }

  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-sm font-medium text-[var(--tm-text)]">{label}</label>
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add() } }}
        onBlur={add}
        disabled={full}
        placeholder={full ? "" : placeholder}
        maxLength={120}
        className="tm-control-focus mt-2 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)] disabled:opacity-45"
      />
      {values.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => onCommit(values.filter((entry) => entry !== value))}
                aria-label={`Remove ${value}`}
                className={cn(
                  "tm-control-focus inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                  "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text)]",
                )}
              >
                {value}
                <X className="size-3.5 text-[var(--tm-text-muted)]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DirectionChoice({ lean, avoid, proposed, onChange }: Props) {
  // Said once, for the section, when either half is Myro's reading. Saying it
  // per list put the same sentence on screen twice — two lines each on a phone —
  // to make one point the user only needs made once.
  const anyProposed = proposed.length > 0 && (lean.length > 0 || avoid.length > 0)
  return (
    <section className="mt-7" aria-labelledby="target-direction">
      <p id="target-direction" className="text-sm font-medium text-[var(--tm-text)]">
        Anything else about the work?{" "}
        <span className="font-normal text-[var(--tm-text-muted)]">
          {anyProposed ? "Read from your CV — fix anything wrong." : "Optional."}
        </span>
      </p>
      <PhraseList
        id="direction-lean"
        label="Drawn to"
        placeholder="e.g. consultative, partnering work"
        values={lean}
        onCommit={(next) => onChange({ lean: next, avoid })}
      />
      <PhraseList
        id="direction-avoid"
        label="Not for you"
        placeholder="e.g. large corporations"
        values={avoid}
        onCommit={(next) => onChange({ lean, avoid: next })}
      />
    </section>
  )
}
