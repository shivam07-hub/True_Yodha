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
 * kinds of work and 234 jobs across 8 are not the same offer, and a card showing
 * only the job count presents them as equals. The order is by fit against the
 * user's own skills; the fit itself is never printed, because a band is not a
 * score.
 *
 * What IS printed is the evidence behind it, with its denominator: "18 of your
 * 34 skills asked here". The corpus totals said how big a field is and nothing
 * about the person choosing it. Names alone made a field matching 2 skills look
 * as strong as one matching 18, so the count carries the strength and the names
 * carry the why.
 */

import { Check } from "lucide-react"

import { formatCount } from "@/lib/format"
import type { CareerBand, CareerBandOption } from "@/lib/api"
import { cn } from "@/lib/utils"

/** The evidence line, or null when there is no CV to read — the card then says
 *  nothing rather than claiming "none of yours" about a CV it never saw. */
export function bandEvidence(option: CareerBandOption): string | null {
  const total = option.cv_skill_count
  const matched = option.matched_count
  if (total == null || matched == null) return null
  const skills = total === 1 ? "skill" : "skills"
  if (matched === 0) return `None of your ${formatCount(total)} ${skills} asked here yet`
  const names = (option.matched_skills ?? []).join(", ")
  const head = `${formatCount(matched)} of your ${formatCount(total)} ${skills} asked here`
  return names ? `${head} · ${names}` : head
}

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
}: {
  /** Server order is fit order. Rendered as given — re-sorting here would put a
   *  second ranking rule in the client. */
  options: CareerBandOption[]
  selected: CareerBand[]
  onChange: (next: CareerBand[]) => void
}) {
  const toggle = (band: CareerBand) => {
    onChange(
      selected.includes(band)
        ? selected.filter((value) => value !== band)
        : [...selected, band],
    )
  }

  return (
    // One column on every surface. Two columns inside the 512px Direction step
    // left ~220px per label: two of the four names wrapped and the counts under
    // them zig-zagged across rows. The step after it lists role families as rows
    // too, so the same kind of choice now reads one way.
    <div
      className="grid grid-cols-1 gap-2"
      role="group"
      aria-label="Career bands"
    >
      {options.map((option) => {
        const picked = selected.includes(option.band)
        const evidence = bandEvidence(option)
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
              {evidence ? (
                <span className="mt-1 block text-pretty text-[length:var(--tm-fs-caption)] text-[var(--tm-text)]">
                  {evidence}
                </span>
              ) : null}
              <span className="mt-1 block text-[length:var(--tm-fs-caption)] text-[var(--tm-text-muted)]">
                {formatCount(option.job_count)} open · {formatCount(option.family_count)}{" "}
                {option.family_count === 1 ? "kind of work" : "kinds of work"}
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
