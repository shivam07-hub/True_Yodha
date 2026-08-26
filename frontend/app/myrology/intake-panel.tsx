"use client"

import { useState, type FormEvent } from "react"

import { MyrologyCta, useMyrology } from "./checkout"

/* 1b — the details, taken before any money changes hands.
 *
 * The panel deliberately casts nothing. A wheel drawn here would have to invent
 * planetary positions we do not compute, which is the exact failure this
 * redesign exists to remove. What it does instead is echo back what the visitor
 * typed, so the only claim on screen is one they can verify themselves, and
 * name the line where the free part stops. */

function IntakeEcho({ dob, time, timeUnknown, place }: {
  dob: string
  time: string
  timeUnknown: boolean
  place: string
}) {
  const filled = dob || place || time || timeUnknown
  if (!filled) return null

  return (
    <div className="intake-echo">
      <div className="intake-echo-tag">WHAT WILL BE CAST</div>
      <div className="intake-echo-row">
        <span className="mono">{dob || "date —"}</span>
        <span className="mono">{timeUnknown ? "time to rectify" : time || "time —"}</span>
        <span className="mono">{place || "place —"}</span>
      </div>
    </div>
  )
}

export function IntakeForm() {
  const { saveIntake } = useMyrology()
  const [dob, setDob] = useState("")
  const [time, setTime] = useState("")
  const [timeUnknown, setTimeUnknown] = useState(false)
  const [place, setPlace] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = dob.trim().length > 0 && place.trim().length > 0 && !busy

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await saveIntake({
        dob,
        birth_time: timeUnknown || !time ? null : time,
        birth_time_unknown: timeUnknown,
        birth_place: place.trim(),
        guidance_note: note.trim() || null,
      })
    } catch {
      setError("Couldn’t save your details. Please retry.")
      setBusy(false)
    }
  }

  return (
    <form className="my-panel" onSubmit={onSubmit}>
      <div className="my-panel-eyebrow"><span className="dot pulse" /> STEP 1 OF 2 · YOUR DETAILS · FREE</div>
      <h3 className="my-panel-title">Three facts. That’s all he needs.</h3>
      <p className="my-panel-sub">
        Date, time and place of birth. No name — yours stays private. Nothing is charged on this
        screen; payment comes after you have seen exactly what you are handing over.
      </p>

      <label className="my-field">
        <span>Date of birth</span>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
      </label>

      <label className="my-field">
        <span>Time of birth</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={timeUnknown} step={60} />
      </label>
      <label className="my-check">
        <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} />
        <span>I don’t know my exact time — rectify in session 1</span>
      </label>

      <label className="my-field">
        <span>Place of birth</span>
        <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="City, country" required />
      </label>

      <label className="my-field">
        <span>What you want guidance on <em>(optional)</em></span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. timing a career switch, choosing between two offers" />
      </label>

      <IntakeEcho dob={dob} time={time} timeUnknown={timeUnknown} place={place} />

      {error ? <div className="my-form-error">{error}</div> : null}
      <button type="submit" className="price-cta" disabled={!canSubmit} data-state={busy ? "starting" : "idle"}>
        {busy ? "Saving…" : "Save & continue to payment →"}
      </button>
    </form>
  )
}

export function PayPanel() {
  const { intake, begin } = useMyrology()

  return (
    <div className="my-panel">
      <div className="my-panel-eyebrow"><span className="dot pulse" /> STEP 2 OF 2 · PAYMENT</div>
      <h3 className="my-panel-title">One step left — confirm and pay.</h3>
      <p className="my-panel-sub">
        ₹299 one-time. We build your written birth-chart report from these details, then unlock your
        3 lifetime sessions.
      </p>

      {intake ? (
        <div className="my-intake-summary">
          <span>{intake.dob}</span>
          <span>{intake.birth_time_unknown ? "time to rectify" : intake.birth_time ?? "—"}</span>
          <span>{intake.birth_place}</span>
          <button type="button" className="my-intake-edit" onClick={begin}>Edit</button>
        </div>
      ) : null}

      <MyrologyCta variant="pay" />
    </div>
  )
}
