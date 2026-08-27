"use client"

/**
 * Where, on the targeting step: chips from the chosen role families, plus a
 * typeahead so "Gurgaon" finds the corpus name "Gurugram".
 *
 * The chips are the options — cities those roles actually hire in. A global
 * analytics list would offer cities with no openings in the work they picked.
 * The matcher is still the shared one, so the alias table is not restated here.
 */

import { useState } from "react"

import { formatCount } from "@/lib/format"
import { locationMatches } from "@/lib/location-catalog"
import { cn } from "@/lib/utils"

export function LocationChoice({
  totalOpen,
  options,
  selected,
  max,
  onChange,
}: {
  totalOpen: number
  options: Array<{ location: string; open_count: number }>
  selected: string[]
  max: number
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState("")
  const listed = options.filter((option) => locationMatches(option.location, query))

  function toggle(location: string) {
    if (selected.includes(location)) {
      onChange(selected.filter((value) => value !== location))
      return
    }
    if (selected.length >= max) return
    onChange([...selected, location])
  }

  return (
    <section className="mt-7" aria-labelledby="target-location">
      <p id="target-location" className="text-sm font-medium text-[var(--tm-text)]">
        Where?{" "}
        <span className="font-normal text-[var(--tm-text-muted)]">
          Up to {max}, or leave empty for anywhere.
        </span>
      </p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="a city"
        autoComplete="off"
        spellCheck={false}
        aria-label="Filter cities"
        className="tm-control-focus mt-3 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={selected.length === 0}
          className={cn(
            "tm-control-focus min-h-11 rounded-md border px-3 text-sm",
            selected.length === 0
              ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]"
              : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]",
          )}
        >
          Anywhere · {formatCount(totalOpen)}
        </button>
        {listed.map((option) => {
          const picked = selected.includes(option.location)
          return (
            <button
              key={option.location}
              type="button"
              onClick={() => toggle(option.location)}
              aria-pressed={picked}
              disabled={!picked && selected.length >= max}
              className={cn(
                "tm-control-focus min-h-11 rounded-md border px-3 text-sm",
                picked
                  ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]"
                  : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]",
                !picked && selected.length >= max && "opacity-45",
              )}
            >
              {option.location} · {formatCount(option.open_count)}
              {option.open_count < 10 ? " · thin" : ""}
            </button>
          )
        })}
      </div>
      {query.trim().length >= 2 && listed.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--tm-text-muted)]">No cities in this role match that search.</p>
      ) : null}
    </section>
  )
}
