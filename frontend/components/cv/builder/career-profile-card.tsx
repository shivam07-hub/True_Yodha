/**
 * CareerProfileCard — the recruiter/logistics fact-layer mini-form (S2).
 *
 * Two mount modes off ONE component (grill locks L1/L2):
 *  - review home (Memory panel): renders every field, grouped — the place to
 *    see and top up everything Myro holds.
 *  - just-in-time (`fields` prop): renders only the facts a moment needs (e.g.
 *    an application asking notice + CTC) — a compact ask at the pain point.
 *
 * Discrete recruiter-shaped facts → a form is the right tool (not conversation).
 * Prefill known values, save only what changed. Nothing is required. Compensation
 * has no consent copy — the user entering it is the consent (lock L4); reporting
 * manager is optional with a purpose hint (PV1).
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CareerProfileData } from "@/lib/api"
import { careerProfile as api } from "@/lib/api"
import "./career-profile-card.css"

type FieldKey = keyof CareerProfileData
type FieldType = "number" | "text" | "textarea" | "bool"

interface FieldSpec {
  key: FieldKey
  label: string
  type: FieldType
  suffix?: string
  placeholder?: string
  hint?: string
  group: string
}

const FIELDS: FieldSpec[] = [
  { key: "total_experience_years", label: "Total experience", type: "number", suffix: "yrs", group: "Experience" },
  { key: "bd_experience_years", label: "Business development", type: "number", suffix: "yrs", group: "Experience" },
  { key: "it_services_years", label: "IT services", type: "number", suffix: "yrs", group: "Experience" },
  { key: "gcc_bd_years", label: "BD with GCC", type: "number", suffix: "yrs", group: "Experience" },
  { key: "current_ctc_fixed_lpa", label: "Current fixed", type: "number", suffix: "LPA", group: "Compensation" },
  { key: "current_ctc_variable_lpa", label: "Current variable", type: "number", suffix: "LPA", group: "Compensation" },
  { key: "expected_ctc_lpa", label: "Expected fixed", type: "number", suffix: "LPA", group: "Compensation" },
  { key: "notice_period_days", label: "Notice period", type: "number", suffix: "days", group: "Logistics" },
  { key: "current_location", label: "Current location", type: "text", placeholder: "City / region", group: "Logistics" },
  { key: "open_to_relocate", label: "Open to relocate", type: "bool", group: "Logistics" },
  { key: "interview_availability", label: "Interview availability", type: "text", placeholder: "e.g. Sat, weekday afternoons", group: "Logistics" },
  { key: "sales_target", label: "Sales target", type: "text", placeholder: "e.g. $5M / 500 resources per year", group: "Performance" },
  { key: "target_achievement", label: "Achieved last year", type: "text", placeholder: "e.g. €500K+ / ~40%", group: "Performance" },
  { key: "new_logos_last_year", label: "New logos last year", type: "number", group: "Performance" },
  { key: "reporting_manager", label: "Reporting manager", type: "text", placeholder: "Optional", hint: "Helps referral / reference context — optional", group: "Performance" },
  { key: "reason_for_change", label: "Reason for a change", type: "textarea", placeholder: "Optional", group: "Performance" },
  { key: "notes", label: "Anything else recruiters ask?", type: "textarea", placeholder: "Optional", group: "More" },
]

const GROUP_ORDER = ["Experience", "Compensation", "Logistics", "Performance", "More"]

function toInput(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v)
}

export function CareerProfileCard({
  token,
  fields,
  title = "Career profile",
  onSaved,
}: {
  token: string
  /** Subset of field keys to render (just-in-time mode). Omit → full form. */
  fields?: FieldKey[]
  title?: string
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ["careerProfile"],
    queryFn: () => api.get(token),
  })

  const specs = useMemo(
    () => (fields ? FIELDS.filter((f) => fields.includes(f.key)) : FIELDS),
    [fields],
  )

  // Local draft, seeded from the server profile once loaded.
  const [draft, setDraft] = useState<Record<string, string | boolean>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  useEffect(() => {
    const p = query.data?.profile
    if (!p) return
    const next: Record<string, string | boolean> = {}
    for (const f of FIELDS) {
      const v = p[f.key]
      next[f.key] = f.type === "bool" ? Boolean(v) : toInput(v)
    }
    setDraft(next)
    setDirty(new Set())
  }, [query.data])

  const save = useMutation({
    mutationFn: () => {
      const patch: Partial<CareerProfileData> = {}
      for (const key of Array.from(dirty)) {
        const spec = FIELDS.find((f) => f.key === key)!
        const raw = draft[key]
        if (spec.type === "bool") {
          ;(patch as Record<string, unknown>)[key] = Boolean(raw)
        } else if (spec.type === "number") {
          const s = String(raw).trim()
          ;(patch as Record<string, unknown>)[key] = s === "" ? null : Number(s)
        } else {
          const s = String(raw).trim()
          ;(patch as Record<string, unknown>)[key] = s === "" ? null : s
        }
      }
      return api.update(token, patch)
    },
    onSuccess: () => {
      setDirty(new Set())
      void qc.invalidateQueries({ queryKey: ["careerProfile"] })
      void qc.invalidateQueries({ queryKey: ["userMemory"] })
      onSaved?.()
    },
  })

  const set = (key: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty((s) => new Set(s).add(key))
  }

  if (query.isError) {
    return <p className="tm-cp-empty" role="alert">Couldn’t load your career profile — try again.</p>
  }

  const grouped = GROUP_ORDER
    .map((g) => ({ group: g, items: specs.filter((f) => f.group === g) }))
    .filter((g) => g.items.length > 0)

  return (
    <section className="tm-cp" aria-label={title}>
      <header className="tm-cp-head">
        <h3 className="tm-cp-title">{title}</h3>
        {query.data?.updated_at && !dirty.size && (
          <span className="tm-cp-saved">Saved</span>
        )}
      </header>

      <form
        className="tm-cp-form"
        onSubmit={(e) => { e.preventDefault(); if (dirty.size) save.mutate() }}
      >
        {grouped.map(({ group, items }) => (
          <fieldset key={group} className="tm-cp-group">
            {!fields && <legend className="tm-cp-legend">{group}</legend>}
            <div className="tm-cp-rows">
              {items.map((f) => (
                <label key={f.key} className={`tm-cp-row tm-cp-row-${f.type}`}>
                  <span className="tm-cp-label">{f.label}</span>
                  {f.type === "bool" ? (
                    <input
                      type="checkbox"
                      className="tm-cp-check"
                      checked={Boolean(draft[f.key])}
                      onChange={(e) => set(f.key, e.target.checked)}
                    />
                  ) : f.type === "textarea" ? (
                    <textarea
                      className="tm-cp-input"
                      rows={2}
                      placeholder={f.placeholder}
                      value={toInput(draft[f.key])}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : (
                    <span className="tm-cp-field">
                      <input
                        className="tm-cp-input"
                        type={f.type === "number" ? "number" : "text"}
                        inputMode={f.type === "number" ? "decimal" : undefined}
                        placeholder={f.placeholder}
                        value={toInput(draft[f.key])}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                      {f.suffix && <span className="tm-cp-suffix">{f.suffix}</span>}
                    </span>
                  )}
                  {f.hint && <span className="tm-cp-hint">{f.hint}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="tm-cp-actions">
          <button
            type="submit"
            className="cvb-btn primary sm"
            disabled={!dirty.size || save.isPending}
          >
            {save.isPending ? "Saving…" : dirty.size ? "Save" : "Saved"}
          </button>
          {save.isError && <span className="tm-cp-err" role="alert">Couldn’t save — try again.</span>}
        </div>
      </form>
    </section>
  )
}
