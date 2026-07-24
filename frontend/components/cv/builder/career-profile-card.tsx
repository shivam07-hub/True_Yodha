/**
 * CareerProfileCard — the recruiter/logistics fact-layer mini-form (S2).
 *
 * Read-first (2026-07-24 redesign): every SAVED fact renders as a "what
 * recruiters ask" card — label, kind tag, value, Edit / Forget — so the
 * memory tab reads as evidence, not an always-open form. Editing a card
 * turns it into a single inline field; empty fields live behind an "Add a
 * detail" disclosure, which reuses the full grouped form for filling many
 * at once (onboarding, or the just-in-time `fields` mode used elsewhere).
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CareerProfileData } from "@/lib/api"
import { careerProfile as api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import "./career-profile-card.css"

type FieldKey = keyof CareerProfileData
type FieldType = "number" | "text" | "textarea" | "bool"
type FieldKind = "Experience" | "Compensation" | "Logistics" | "Performance" | "Reference" | "Note"

interface FieldSpec {
  key: FieldKey
  label: string
  type: FieldType
  kind: FieldKind
  suffix?: string
  placeholder?: string
  hint?: string
  group: string
}

const FIELDS: FieldSpec[] = [
  { key: "total_experience_years", label: "Total experience", type: "number", suffix: "yrs", group: "Experience", kind: "Experience" },
  { key: "bd_experience_years", label: "Business development", type: "number", suffix: "yrs", group: "Experience", kind: "Experience" },
  { key: "it_services_years", label: "IT services", type: "number", suffix: "yrs", group: "Experience", kind: "Experience" },
  { key: "gcc_bd_years", label: "BD with GCC", type: "number", suffix: "yrs", group: "Experience", kind: "Experience" },
  { key: "current_ctc_fixed_lpa", label: "Current fixed", type: "number", suffix: "LPA", group: "Compensation", kind: "Compensation" },
  { key: "current_ctc_variable_lpa", label: "Current variable", type: "number", suffix: "LPA", group: "Compensation", kind: "Compensation" },
  { key: "expected_ctc_lpa", label: "Expected fixed", type: "number", suffix: "LPA", group: "Compensation", kind: "Compensation" },
  { key: "notice_period_days", label: "Notice period", type: "number", suffix: "days", group: "Logistics", kind: "Logistics" },
  { key: "current_location", label: "Current location", type: "text", placeholder: "City / region", group: "Logistics", kind: "Logistics" },
  { key: "open_to_relocate", label: "Open to relocate", type: "bool", group: "Logistics", kind: "Logistics" },
  { key: "interview_availability", label: "Interview availability", type: "text", placeholder: "e.g. Sat, weekday afternoons", group: "Logistics", kind: "Logistics" },
  { key: "sales_target", label: "Sales target", type: "text", placeholder: "e.g. $5M / 500 resources per year", group: "Performance", kind: "Performance" },
  { key: "target_achievement", label: "Achieved last year", type: "text", placeholder: "e.g. €500K+ / ~40%", group: "Performance", kind: "Performance" },
  { key: "new_logos_last_year", label: "New logos last year", type: "number", group: "Performance", kind: "Performance" },
  { key: "reporting_manager", label: "Reporting manager", type: "text", placeholder: "Optional", hint: "Helps referral / reference context — optional", group: "Performance", kind: "Reference" },
  { key: "reason_for_change", label: "Reason for a change", type: "textarea", placeholder: "Optional", group: "Performance", kind: "Note" },
  { key: "notes", label: "Anything else recruiters ask?", type: "textarea", placeholder: "Optional", group: "More", kind: "Note" },
]

const GROUP_ORDER = ["Experience", "Compensation", "Logistics", "Performance", "More"]

function toInput(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v)
}

function displayValue(spec: FieldSpec, raw: unknown): string {
  if (spec.type === "bool") return raw ? "Yes" : "No"
  const s = toInput(raw)
  return spec.suffix ? `${s} ${spec.suffix}` : s
}

function isPopulated(raw: unknown): boolean {
  return raw !== null && raw !== undefined && raw !== ""
}

/** One saved fact, view mode; flips to a single-field editor on "Edit". */
function FactCard({ token, spec, raw, onSaved }: {
  token: string
  spec: FieldSpec
  raw: unknown
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string | boolean>(spec.type === "bool" ? Boolean(raw) : toInput(raw))

  const save = useMutation({
    mutationFn: (value: string | boolean | null) => {
      const patch: Partial<CareerProfileData> = {}
      if (spec.type === "bool") (patch as Record<string, unknown>)[spec.key] = value === null ? null : Boolean(value)
      else if (spec.type === "number") {
        const s = value === null ? "" : String(value).trim()
        ;(patch as Record<string, unknown>)[spec.key] = s === "" ? null : Number(s)
      } else {
        const s = value === null ? "" : String(value).trim()
        ;(patch as Record<string, unknown>)[spec.key] = s === "" ? null : s
      }
      return api.update(token, patch)
    },
    onSuccess: () => { setEditing(false); onSaved() },
  })

  if (editing) {
    return (
      <div className="tm-cp-card is-editing">
        <div className="tm-cp-card-head">
          <span className="tm-cp-card-label">{spec.label}</span>
          <span className="tm-cp-card-kind">{spec.kind.toUpperCase()}</span>
        </div>
        {spec.type === "bool" ? (
          <label className="tm-cp-card-bool">
            <input
              type="checkbox"
              className="tm-cp-check"
              checked={Boolean(draft)}
              onChange={(e) => setDraft(e.target.checked)}
            />
            {spec.label}
          </label>
        ) : spec.type === "textarea" ? (
          <textarea
            className="tm-cp-input"
            rows={2}
            autoFocus
            value={String(draft)}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <span className="tm-cp-field">
            <input
              className="tm-cp-input"
              type={spec.type === "number" ? "number" : "text"}
              inputMode={spec.type === "number" ? "decimal" : undefined}
              autoFocus
              value={String(draft)}
              onChange={(e) => setDraft(e.target.value)}
            />
            {spec.suffix && <span className="tm-cp-suffix">{spec.suffix}</span>}
          </span>
        )}
        <div className="tm-cp-card-actions">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(draft)}>Save</Button>
          <button type="button" className="tm-cp-link" onClick={() => { setEditing(false); setDraft(spec.type === "bool" ? Boolean(raw) : toInput(raw)) }}>
            Cancel
          </button>
        </div>
        {save.isError && <span className="tm-cp-err" role="alert">Couldn’t save — try again.</span>}
      </div>
    )
  }

  return (
    <div className="tm-cp-card">
      <div className="tm-cp-card-head">
        <span className="tm-cp-card-label">{spec.label}</span>
        <span className="tm-cp-card-kind">{spec.kind.toUpperCase()}</span>
      </div>
      <p className="tm-cp-card-value">{displayValue(spec, raw)}</p>
      <div className="tm-cp-card-actions">
        <button type="button" className="tm-cp-link" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="tm-cp-link" disabled={save.isPending} onClick={() => save.mutate(null)}>Forget</button>
      </div>
    </div>
  )
}

/** The full grouped form — reachable behind "Add a detail" for filling in
 *  empty fields (or the just-in-time `fields` mode used at other call sites). */
function AddDetailsForm({ token, specs, onSaved }: {
  token: string
  specs: FieldSpec[]
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, string | boolean>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  const save = useMutation({
    mutationFn: () => {
      const patch: Partial<CareerProfileData> = {}
      for (const key of Array.from(dirty)) {
        const spec = specs.find((f) => f.key === key)!
        const raw = draft[key]
        if (spec.type === "bool") (patch as Record<string, unknown>)[key] = Boolean(raw)
        else if (spec.type === "number") {
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
      setDraft({}); setDirty(new Set())
      void qc.invalidateQueries({ queryKey: ["careerProfile"] })
      void qc.invalidateQueries({ queryKey: ["userMemory"] })
      onSaved()
    },
  })

  const set = (key: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty((s) => new Set(s).add(key))
  }

  const grouped = GROUP_ORDER
    .map((g) => ({ group: g, items: specs.filter((f) => f.group === g) }))
    .filter((g) => g.items.length > 0)

  if (specs.length === 0) return <p className="tm-cp-empty">Nothing left to add — everything below is filled in.</p>

  return (
    <form className="tm-cp-form" onSubmit={(e) => { e.preventDefault(); if (dirty.size) save.mutate() }}>
      {grouped.map(({ group, items }) => (
        <fieldset key={group} className="tm-cp-group">
          <legend className="tm-cp-legend">{group}</legend>
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
        <Button type="submit" size="sm" disabled={!dirty.size || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {save.isError && <span className="tm-cp-err" role="alert">Couldn’t save — try again.</span>}
      </div>
    </form>
  )
}

export function CareerProfileCard({
  token,
  fields,
  title = "Career profile",
  onSaved,
}: {
  token: string
  /** Subset of field keys to render (just-in-time mode). Omit -> full form. */
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

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["careerProfile"] })
    void qc.invalidateQueries({ queryKey: ["userMemory"] })
    onSaved?.()
  }

  // Just-in-time mode (a specific ask at a specific moment) keeps the plain
  // always-editable form — no populated/empty split to make there.
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => { if (!fields) setAddOpen(false) }, [fields])

  if (query.isError) {
    return <p className="tm-cp-empty" role="alert">Couldn’t load your career profile — try again.</p>
  }
  if (query.isPending) {
    return <p className="tm-cp-empty">Loading…</p>
  }

  if (fields) {
    return (
      <section className="tm-cp" aria-label={title}>
        <header className="tm-cp-head"><h3 className="tm-cp-title">{title}</h3></header>
        <AddDetailsForm token={token} specs={specs} onSaved={invalidate} />
      </section>
    )
  }

  const profile = query.data?.profile ?? {}
  const populated = specs.filter((f) => isPopulated((profile as Record<string, unknown>)[f.key]))
  const empty = specs.filter((f) => !isPopulated((profile as Record<string, unknown>)[f.key]))

  return (
    <section className="tm-cp" aria-label={title}>
      <header className="tm-cp-head">
        <h3 className="tm-cp-title">{title}</h3>
      </header>

      {populated.length === 0 && !addOpen && (
        <p className="tm-cp-empty">Nothing saved yet — add what recruiters usually ask.</p>
      )}

      {populated.length > 0 && (
        <div className="tm-cp-grid">
          {populated.map((f) => (
            <FactCard
              key={f.key}
              token={token}
              spec={f}
              raw={(profile as Record<string, unknown>)[f.key]}
              onSaved={invalidate}
            />
          ))}
        </div>
      )}

      <details className="tm-cp-add" open={addOpen} onToggle={(e) => setAddOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{populated.length === 0 ? "Add a detail" : `Add more (${empty.length} left)`}</summary>
        <AddDetailsForm token={token} specs={empty} onSaved={invalidate} />
      </details>
    </section>
  )
}
