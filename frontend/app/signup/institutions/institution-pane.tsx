"use client"

import { useState } from "react"
import { institutions, type InstitutionApplicationBody } from "@/lib/api"

const PERSONAL = /@(gmail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail|mail|live|me)\./i

const TITLES = ["Dean — Placements", "T&P Officer / Head", "Career Services Director", "Faculty Coordinator", "Registrar / Admin", "Student Placement Coordinator", "Other"]
const TYPES = ["IIT / IIM / NIT / IIIT", "Private engineering college", "B-school / Management institute", "Liberal arts / University", "Polytechnic / Vocational", "Deemed university", "EdTech / Bootcamp"]
const SIZES = ["Under 250", "250 – 1,000", "1,000 – 5,000", "5,000+"]
const NEEDS = ["Cohort-level CV scoring & prep", "Skill-gap analysis against live hiring", "Placement analytics dashboard", "Alumni outcomes tracking", "Curriculum signal / syllabus feedback", "End-to-end placement OS"]

type Form = {
  instName: string; contactName: string; contactTitle: string
  email: string; instType: string; instSize: string; instFocus: string
}
const EMPTY: Form = { instName: "", contactName: "", contactTitle: "", email: "", instType: "", instSize: "", instFocus: "" }
const REQUIRED: (keyof Form)[] = ["instName", "contactName", "contactTitle", "email", "instType", "instSize"]

const Aperture = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" />
    <path d="M12 3v3M12 18v3M21 12h-3M6 12H3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6" />
  </svg>
)

export function InstitutionPane() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Set<keyof Form>>(new Set())
  const [emailMsg, setEmailMsg] = useState<{ text: string; tone: "hint" | "ok" | "err" } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ inst: string; contact: string } | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const set = (k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => { const n = new Set(e); n.delete(k); return n })
  }

  function checkEmail(v: string): boolean {
    const t = v.trim()
    if (!t) { setEmailMsg(null); return true }
    if (PERSONAL.test(t)) { setEmailMsg({ text: "Personal email detected — please use your institutional address.", tone: "err" }); return false }
    setEmailMsg({ text: "Domain looks institutional. We'll verify in our review.", tone: "ok" })
    return true
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)
    const bad = new Set<keyof Form>()
    REQUIRED.forEach((k) => { if (!form[k].trim()) bad.add(k) })
    if (!checkEmail(form.email)) bad.add("email")
    if (bad.size) { setErrors(bad); return }
    setSubmitting(true)
    const body: InstitutionApplicationBody = {
      institute_name: form.instName, contact_name: form.contactName, contact_title: form.contactTitle,
      email: form.email, institute_type: form.instType, students_per_year: form.instSize,
      primary_need: form.instFocus || null,
    }
    try {
      await institutions.apply(body)
      setDone({ inst: form.instName, contact: form.contactName })
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Could not submit. Try again.")
      setSubmitting(false)
    }
  }

  const cls = (k: keyof Form) => `es-input${errors.has(k) ? " es-error" : ""}`
  const selCls = (k: keyof Form) => `es-select${errors.has(k) ? " es-error" : ""}`

  return (
    <>
      <section className="es-left es-mode-fade" aria-label="Why Myro for institutions">
        <span className="es-eyebrow">For placement cells · pilot cohort</span>
        <h1 className="es-headline">
          Know your batch <span className="es-glow">before the recruiter does</span>.
        </h1>
        <p className="es-subhead">
          Every student uploads their CV once. Myro reads it, pulls out the skills that are
          actually there, and scores them across ten career domains against what companies
          are hiring for this month. You get the batch back: who&apos;s ready, who&apos;s two
          skills short, and which two.
        </p>

        <div className="es-cohort-card">
          <div className="es-cohort-head">
            <div className="es-cohort-title">Sample batch report · CS &apos;26</div>
            <div className="es-cohort-meta">SAMPLE · 327 STUDENTS · TARGET FINTECH</div>
          </div>
          <div className="es-cohort-bar" role="img" aria-label="Cohort fit segments">
            <div className="es-cohort-seg" style={{ width: "27%", background: "var(--tm-accent)" }} />
            <div className="es-cohort-seg" style={{ width: "43%", background: "var(--es-info)" }} />
            <div className="es-cohort-seg" style={{ width: "21%", background: "var(--tm-warning)" }} />
            <div className="es-cohort-seg" style={{ width: "9%", background: "var(--tm-danger)" }} />
          </div>
          <div className="es-cohort-legend">
            <div className="es-cohort-leg-item">
              <span className="es-cohort-swatch" style={{ background: "var(--tm-accent)" }} />
              <div><div className="es-cohort-leg-num">89</div><div className="es-cohort-leg-lbl"><strong style={{ color: "var(--tm-accent)" }}>Placement-ready</strong> · score ≥ 80</div></div>
            </div>
            <div className="es-cohort-leg-item">
              <span className="es-cohort-swatch" style={{ background: "var(--es-info)" }} />
              <div><div className="es-cohort-leg-num">142</div><div className="es-cohort-leg-lbl"><strong style={{ color: "var(--es-info)" }}>1–2 skill gaps</strong> · score 60–79</div></div>
            </div>
            <div className="es-cohort-leg-item">
              <span className="es-cohort-swatch" style={{ background: "var(--tm-warning)" }} />
              <div><div className="es-cohort-leg-num">96</div><div className="es-cohort-leg-lbl"><strong style={{ color: "var(--tm-warning)" }}>Needs focus</strong> · score &lt; 60</div></div>
            </div>
          </div>
          <div className="es-cohort-footer">
            <span className="es-live-dot" aria-hidden="true" />
            <strong>Top gaps:</strong> system design (118) · LLM ops (94) · K8s (71)
          </div>
        </div>

        <div className="es-caps">
          {CAPS.map((c) => (
            <div className="es-cap" key={c.title}>
              <div className="es-cap-icon" aria-hidden="true">{c.icon}</div>
              <div><p className="es-cap-title">{c.title}</p><p className="es-cap-body">{c.body}</p></div>
            </div>
          ))}
        </div>

        <div className="es-trust">
          <div className="es-trust-label">What the pilot costs you</div>
          <div className="es-logos">
            <span className="es-logo">50&nbsp;students</span>
            <span className="es-logo">One&nbsp;department</span>
            <span className="es-logo">Free</span>
            <span className="es-logo es-logo-mono">no_contract</span>
          </div>
          <p className="es-trust-note">
            You tell us if the readiness picture matches the students you already know.
          </p>
        </div>
      </section>

      <aside className="es-right es-mode-fade" aria-label="Apply for institutional access">
        {done ? (
          <>
            <div className="es-success-card">
              <div className="es-success-aperture" aria-hidden="true"><Aperture /></div>
              <h2 className="es-success-title">Application received, {done.contact.split(" ")[0]}.</h2>
              <p className="es-success-sub">
                We&apos;ll read <strong>{done.inst}</strong> and reply in <strong>two working days</strong>.
              </p>
              <div className="es-success-next">
                <div className="es-success-row"><span className="es-n">1</span><span><strong>A 30-minute call</strong> — your cohort, your target sectors, what keeps going wrong.</span></div>
                <div className="es-success-row"><span className="es-n">2</span><span><strong>Pick one department</strong> — fifty students, CVs uploaded in a week.</span></div>
                <div className="es-success-row"><span className="es-n">3</span><span><strong>Your batch report</strong> — and an honest verdict on whether this is worth your time.</span></div>
              </div>
            </div>
            <p className="es-alt-cta">Need to update your application? <a href="mailto:edu@himyro.com">Email our edu lead →</a></p>
          </>
        ) : (
          <>
            <div className="es-form-card">
              <div className="es-form-eyebrow"><span>Pilot cohort</span> <span className="es-badge">~3 min</span></div>
              <h2 className="es-form-title">Apply for your placement cell</h2>
              <p className="es-form-sub">
                Tell us about your cohort. We&apos;ll come back in two working days with a
                pilot plan for one department.
              </p>

              <form onSubmit={submit} noValidate>
                <div className="es-form-grid">
                  <div className="es-field es-full">
                    <label className="es-label" htmlFor="instName">Institute name<span className="es-req">*</span></label>
                    <input className={cls("instName")} id="instName" value={form.instName} onChange={(e) => set("instName", e.target.value)} placeholder="IIIT Hyderabad" />
                  </div>
                  <div className="es-field">
                    <label className="es-label" htmlFor="contactName">Your name<span className="es-req">*</span></label>
                    <input className={cls("contactName")} id="contactName" autoComplete="name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Dr. R. Sharma" />
                  </div>
                  <div className="es-field">
                    <label className="es-label" htmlFor="contactTitle">Your title<span className="es-req">*</span></label>
                    <select className={selCls("contactTitle")} id="contactTitle" value={form.contactTitle} onChange={(e) => set("contactTitle", e.target.value)}>
                      <option value="">Select title</option>
                      {TITLES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="es-field es-full">
                    <label className="es-label" htmlFor="instEmail">Official email<span className="es-req">*</span></label>
                    <input className={cls("email")} id="instEmail" type="email" autoComplete="email" value={form.email}
                      onChange={(e) => { set("email", e.target.value); if (errors.has("email")) checkEmail(e.target.value) }}
                      onBlur={(e) => checkEmail(e.target.value)} placeholder="placement@institute.edu" />
                    <span className="es-field-hint" style={emailMsg ? { color: emailMsg.tone === "err" ? "var(--tm-danger)" : emailMsg.tone === "ok" ? "var(--tm-success)" : undefined } : undefined}>
                      {emailMsg ? emailMsg.text : <>Use your <code>.edu</code>, <code>.ac.in</code>, or institutional domain.</>}
                    </span>
                  </div>
                  <div className="es-field">
                    <label className="es-label" htmlFor="instType">Institute type<span className="es-req">*</span></label>
                    <select className={selCls("instType")} id="instType" value={form.instType} onChange={(e) => set("instType", e.target.value)}>
                      <option value="">Select type</option>
                      {TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="es-field">
                    <label className="es-label" htmlFor="instSize">Students placed / year<span className="es-req">*</span></label>
                    <select className={selCls("instSize")} id="instSize" value={form.instSize} onChange={(e) => set("instSize", e.target.value)}>
                      <option value="">Select size</option>
                      {SIZES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="es-field es-full">
                    <label className="es-label" htmlFor="instFocus">Primary need</label>
                    <select className="es-select" id="instFocus" value={form.instFocus} onChange={(e) => set("instFocus", e.target.value)}>
                      <option value="">Select focus</option>
                      {NEEDS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {apiError && <p role="alert" className="es-field-hint" style={{ color: "var(--tm-danger)", marginTop: 10 }}>{apiError}</p>}

                <button className="es-submit" type="submit" disabled={submitting}>
                  <span>{submitting ? "Sending…" : "Apply for a pilot"}</span>
                  {!submitting && <span aria-hidden="true">→</span>}
                </button>

                <p className="es-legal">
                  We&apos;ll never email your students without your written sign-off.{" "}
                  <a href="/privacy">Privacy</a>.
                </p>
              </form>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

const I = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
// Every card below must name something a student can open today. The six that
// shipped here first (LMS sync, analytics dashboards, alumni tracking, SSO,
// branded portal) described software that does not exist — the institutions
// backend is one POST /apply. Do not add a card ahead of the build.
const CAPS = [
  { title: "CV scoring", body: "Reads the CV, finds the real skills, scores each student out of 100 across ten career domains.", icon: I('<path d="M16 19a4 4 0 00-8 0M12 11a4 4 0 100-8 4 4 0 000 8zM3 21h18"/>') },
  { title: "Skill gaps, priced by the market", body: "Every gap traces back to a live job posting in India. Hiring moves, the gaps move with it.", icon: I('<path d="M3 3v18h18M7 14l4-4 3 3 6-6"/>') },
  { title: "Live job matching", body: "Every student sees openings they can clear today, and the ones a skill away.", icon: I('<path d="M4 19V5l8 4 8-4v14"/>') },
  { title: "CV tailoring", body: "One CV per company, rewritten against that company's posting. Exports to PDF.", icon: I('<path d="M12 2v6m0 8v6M2 12h6m8 0h6"/><circle cx="12" cy="12" r="3"/>') },
  { title: "Interview prep", body: "A prep room per job, built from the posting the student is chasing.", icon: I('<path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/>') },
  { title: "The batch report", body: "We run it and hand it to you. Numbers you can put in front of the dean.", icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>') },
]
