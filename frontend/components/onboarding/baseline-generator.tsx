"use client"

import { useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { onboarding, type OnboardingState } from "@/lib/api"

const QUESTIONS = [
  { title: "How should your CV identify you?", note: "CV identity is optional and separate from your account.", fields: [["preferred_name", "Preferred name"], ["email", "CV email (optional)"], ["phone", "Phone (optional)"], ["location", "Location (optional)"], ["linkedin_url", "LinkedIn URL (optional)"]] },
  { title: "What work have you done?", note: "Employment, internships, volunteering, or substantial projects all count.", fields: [["role", "Role or project title"], ["organization", "Organization (optional)"], ["dates", "Dates (optional)"], ["projects", "Projects, one per line"]] },
  { title: "What changed because of your work?", note: "Use concrete outcomes. Numbers are welcome only when they are true.", fields: [["achievements", "Outcomes, one per line"]] },
  { title: "What can you do?", note: "Add tools and skills you have actually used.", fields: [["skills", "Skills and tools, one per line"], ["projects", "Relevant projects, one per line"]] },
  { title: "What backs it up?", note: "Education and certifications are optional.", fields: [["education", "Education, one per line"], ["certifications", "Certifications, one per line"]] },
] as const

type Values = Record<string, string>

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean)
}

function answerFor(step: number, values: Values): Record<string, unknown> {
  if (step === 1) return values
  if (step === 2) return {
    roles: values.role?.trim() ? [{ title: values.role.trim(), organization: values.organization?.trim() ?? "", dates: values.dates?.trim() ?? "" }] : [],
    projects: lines(values.projects ?? ""),
  }
  if (step === 3) return { achievements: lines(values.achievements ?? "") }
  if (step === 4) return { skills: lines(values.skills ?? ""), projects: lines(values.projects ?? "") }
  return { education: lines(values.education ?? ""), certifications: lines(values.certifications ?? "") }
}

function valuesFor(step: number, source: Record<string, unknown> | undefined): Values {
  if (!source) return {}
  if (step === 2) {
    const role = Array.isArray(source.roles) && typeof source.roles[0] === "object" ? source.roles[0] as Record<string, unknown> : {}
    return { role: String(role.title ?? ""), organization: String(role.organization ?? ""), dates: String(role.dates ?? ""), projects: Array.isArray(source.projects) ? source.projects.join("\n") : "" }
  }
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : String(value ?? "")]))
}

interface Props { token: string; state: OnboardingState; onApproved: () => void; onCancel: () => void }

export function BaselineGenerator({ token, state, onApproved, onCancel }: Props) {
  const initialStep = Math.max(1, Math.min(5, state.generator_step || 1))
  const [step, setStep] = useState(initialStep)
  const [values, setValues] = useState<Values>(() => valuesFor(initialStep, state.generator_answers[String(initialStep)]))
  const [draft, setDraft] = useState(state.generated_draft ?? "")
  const [reviewing, setReviewing] = useState(Boolean(state.generated_draft))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const approvalKey = useRef(crypto.randomUUID())
  const question = QUESTIONS[step - 1]

  function go(next: number) {
    setStep(next)
    setValues(valuesFor(next, state.generator_answers[String(next)]))
    setError(null)
  }

  async function continueQuestion() {
    setBusy(true); setError(null)
    try {
      await onboarding.saveAnswer(token, step, answerFor(step, values))
      state.generator_answers[String(step)] = answerFor(step, values)
      if (step < 5) go(step + 1)
      else {
        const generated = await onboarding.generateBaseline(token)
        setDraft(generated.draft)
        setReviewing(true)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This answer could not be saved.")
    } finally { setBusy(false) }
  }

  async function approve() {
    setBusy(true); setError(null)
    try {
      await onboarding.saveDraft(token, draft)
      await onboarding.approveBaseline(token, draft, approvalKey.current)
      onApproved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The baseline could not be approved.")
    } finally { setBusy(false) }
  }

  if (reviewing) return (
    <section className="w-full max-w-2xl" aria-labelledby="baseline-review-title">
      <p className="text-sm font-semibold text-[var(--tm-interactive)]"><Check className="mr-1 inline size-4" aria-hidden="true" />5 of 5 complete</p>
      <h1 id="baseline-review-title" className="mt-2 text-3xl font-semibold tracking-normal text-[var(--tm-text)]">Review your starter CV</h1>
      <p className="mt-2 text-sm text-[var(--tm-text-muted)]">Edit anything that is unclear. Myro has only used facts from your answers.</p>
      <textarea aria-label="Starter CV draft" value={draft} onChange={(event) => setDraft(event.target.value)} rows={18} className="tm-control-focus mt-5 w-full resize-y rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-4 font-mono text-sm leading-6 text-[var(--tm-text)]" />
      {error && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => { setReviewing(false); go(5) }}>Back to answers</Button>
        <Button size="lg" disabled={busy || draft.trim().length < 80} onClick={() => void approve()}>{busy ? "Approving..." : "Approve baseline"}</Button>
      </div>
    </section>
  )

  return (
    <section className="w-full max-w-xl" aria-labelledby="generator-question">
      <p className="text-sm text-[var(--tm-text-muted)]">5 questions · about 2 minutes</p>
      <div className="mt-3 grid grid-cols-5 gap-2" aria-label={`Question ${step} of 5`}>
        {QUESTIONS.map((_, index) => <span key={index} className={`h-1.5 rounded-full ${index < step ? "bg-[var(--tm-interactive)]" : "bg-[var(--tm-border-soft)]"}`} />)}
      </div>
      <p className="mt-5 text-sm font-semibold text-[var(--tm-interactive)]">Question {step} of 5</p>
      <h1 id="generator-question" className="mt-2 text-balance text-2xl font-semibold tracking-normal text-[var(--tm-text)]">{question.title}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{question.note}</p>
      <div className="mt-6 space-y-4">
        {question.fields.map(([key, label]) => {
          const multiline = ["projects", "achievements", "skills", "education", "certifications"].includes(key)
          const shared = { id: `answer-${key}`, value: values[key] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [key]: event.target.value })), className: "tm-control-focus mt-2 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-3 text-base text-[var(--tm-text)]" }
          return <div key={key}><label htmlFor={`answer-${key}`} className="text-sm font-medium text-[var(--tm-text)]">{label}</label>{multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}</div>
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{error}</p>}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => step > 1 ? go(step - 1) : onCancel()}><ArrowLeft className="size-4" />Back</Button>
        <Button size="lg" disabled={busy} onClick={() => void continueQuestion()}>{busy ? "Saving..." : step === 5 ? "Review baseline" : "Continue"}<ArrowRight className="size-4" /></Button>
      </div>
    </section>
  )
}
