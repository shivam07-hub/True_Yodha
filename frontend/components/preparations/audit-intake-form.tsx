"use client"

/**
 * The intake. Six questions, each answerable by the person who RUNS the
 * workflow rather than the person who designed it.
 *
 * The last one asks when they are free, because the service is a call and a
 * time is part of the brief — not something chased over email afterwards.
 */

import { useState } from "react"
import type { AuditIntake } from "@/lib/api"

const FIELDS: { name: keyof AuditIntake; label: string; hint: string }[] = [
  {
    name: "what_the_workflow_does",
    label: "What the workflow does",
    hint: "In your own words. What goes in, what comes out, who it is for.",
  },
  {
    name: "tools_used",
    label: "What it runs on",
    hint: "Models, tools, scripts, spreadsheets. Anything in the chain.",
  },
  {
    name: "data_it_touches",
    label: "What data it touches",
    hint: "Customer records, CVs, financials, internal documents.",
  },
  {
    name: "who_checks_the_output",
    label: "Who checks the output",
    hint: "A person, a rule, a second model, or nobody. Nobody is a valid answer.",
  },
  {
    name: "what_happens_when_it_is_wrong",
    label: "What happens when it is wrong",
    hint: "The last time it was wrong, if there was one. Who noticed, and how.",
  },
  {
    name: "when_you_are_free",
    label: "When you are free",
    hint: "A few windows over the next two weeks, with your timezone.",
  },
]

const EMPTY: AuditIntake = {
  what_the_workflow_does: "",
  tools_used: "",
  data_it_touches: "",
  who_checks_the_output: "",
  what_happens_when_it_is_wrong: "",
  when_you_are_free: "",
}

export function AuditIntakeForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (intake: AuditIntake) => void
  pending: boolean
  error: string | null
}) {
  const [values, setValues] = useState<AuditIntake>(EMPTY)

  return (
    <section className="awr">
      <h1 className="awr-title">Tell us what you run</h1>
      <p className="awr-lede">
        Six questions. We read this before the call, so the time is spent on your
        workflow rather than on catching up.
      </p>

      <form
        className="awr-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(values)
        }}
      >
        {FIELDS.map((field) => (
          <div className="awr-field" key={field.name}>
            <label className="awr-label" htmlFor={field.name}>{field.label}</label>
            <span className="awr-hint" id={`${field.name}-hint`}>{field.hint}</span>
            <textarea
              id={field.name}
              className="tm-input awr-textarea"
              rows={3}
              aria-describedby={`${field.name}-hint`}
              value={values[field.name]}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
            />
          </div>
        ))}

        {error ? <p className="awr-error" role="alert">{error}</p> : null}

        <button type="submit" className="tm-btn-primary awr-cta" disabled={pending}>
          {pending ? "Sending" : "Send it in"}
        </button>
      </form>
    </section>
  )
}
