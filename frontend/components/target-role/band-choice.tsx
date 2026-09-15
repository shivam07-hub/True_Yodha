"use client"

/**
 * THE Career Band control — one component, three surfaces.
 *
 * Before this, the only place in the app that let anyone touch their bands was
 * the market filters sheet, as three switches reading "Also explore X" arranged
 * around a primary the user never chose. That shape encoded a model we no longer
 * hold: a band derived from your CV, plus optional excursions off it. A band is
 * asked now (a CV-derived band matches the person's own choice only 62.4% of the
 * time), and every band is the same kind of answer, so there is no primary to
 * arrange the others around and no "also".
 *
 * Onboarding, the filters sheet and Settings render this. A second band UI is how
 * the app ends up with two answers to "which bands is this person in" — the exact
 * drift ADR-0022 was written to remove.
 *
 * Counts are two different facts and both are needed. 17,960 jobs across 235
 * directions and 234 jobs across 8 are not the same offer, and a card showing
 * only the job count presents them as equals. The order is by fit against the
 * user's own skills; the fit itself is never printed, because a band is not a
 * score.
 */

import { Check } from "lucide-react"

import { formatCount } from "@/lib/format"
import type { CareerBand, CareerBandOption } from "@/lib/api"
import { cn } from "@/lib/utils"

/** The whole vocabulary. Four, and the reason there is no "and 3 more". */
export const CAREER_BAND_LABEL: Record<CareerBand, string> = {
  engineering_data: "Engineering & Data",
  business_product_operations: "Business, Product & Operations",
  research_people_public_impact: "Research, People & Public Impact",
  design_creative: "Design & Creative",
}

export function BandChoice({
  options,
  selected,
  onChange,
  layout = "cards",
}: {
  /** Server order is fit order. Rendered as given — re-sorting here would put a
   *  second ranking rule in the client. */
  options: CareerBandOption[]
  selected: CareerBand[]
  onChange: (next: CareerBand[]) => void
  /** `cards` for a step that owns the screen, `rows` inside a sheet or modal. */
  layout?: "cards" | "rows"
}) {
  const toggle = (band: CareerBand) => {
    onChange(
      selected.includes(band)
        ? selected.filter((value) => value !== band)
        : [...selected, band],
    )
  }

  return (
    <div
      className={cn(
        "grid gap-2",
        layout === "cards" ? "sm:grid-cols-2" : "grid-cols-1",
      )}
      role="group"
      aria-label="Career bands"
    >
      {options.map((option) => {
        const picked = selected.includes(option.band)
        return (
          <button
            key={option.band}
            type="button"
            onClick={() => toggle(option.band)}
            aria-pressed={picked}
            className={cn(
              "tm-control-focus flex min-h-14 w-full items-start justify-between gap-3 rounded-md border px-4 py-3 text-left",
              picked
                ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]"
                : "border-[var(--tm-border-soft)] bg-[var(--tm-surface)]",
            )}
          >
            <span className="min-w-0">
              <span className="block text-[length:var(--tm-fs-body)] font-medium text-[var(--tm-text)]">
                {CAREER_BAND_LABEL[option.band]}
              </span>
              <span className="mt-1 block text-[length:var(--tm-fs-caption)] text-[var(--tm-text-muted)]">
                {formatCount(option.job_count)} open · {formatCount(option.family_count)}{" "}
                {option.family_count === 1 ? "direction" : "directions"}
              </span>
            </span>
            {picked ? (
              <Check
                className="mt-0.5 size-4 shrink-0 text-[var(--tm-interactive)]"
                strokeWidth={1.5}
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
