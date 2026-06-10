"use client"

import { useState, type FormEvent } from "react"

import { useMyrology } from "./checkout"

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  done: "Delivered",
  cancelled: "Cancelled",
}

// The transition timestamp that anchors each status, so the row can say WHEN it
// happened — the badge alone only says what state it's in.
function statusMoment(b: {
  status: string
  confirmed_at: string | null
  done_at: string | null
  cancelled_at: string | null
}): string | null {
  const iso = b.status === "done" ? b.done_at : b.status === "confirmed" ? b.confirmed_at : b.status === "cancelled" ? b.cancelled_at : null
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

function IntakeForm() {
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
      <div className="my-panel-eyebrow"><span className="dot pulse" /> UNLOCKED · STEP 1 OF 2</div>
      <h3 className="my-panel-title">Three facts. That’s all he needs.</h3>
      <p className="my-panel-sub">Date, time and place of birth. No name — yours stays private.</p>

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

      {error ? <div className="my-form-error">{error}</div> : null}
      <button type="submit" className="price-cta" disabled={!canSubmit} data-state={busy ? "starting" : "idle"}>
        {busy ? "Saving…" : "Save & continue →"}
      </button>
    </form>
  )
}

function BookingPanel() {
  const { intake, bookings, createBooking } = useMyrology()
  const [windows, setWindows] = useState("")
  const [topic, setTopic] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = windows.trim().length > 0 && !busy

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await createBooking({ preferred_windows: windows.trim(), topic: topic.trim() || null })
      setWindows("")
      setTopic("")
    } catch {
      setError("Couldn’t send the request. Please retry.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="my-panel">
      <div className="my-panel-eyebrow"><span className="dot pulse" /> UNLOCKED · STEP 2 OF 2</div>
      <h3 className="my-panel-title">Request a session.</h3>
      <p className="my-panel-sub">One astrologer, limited slots per day. He confirms each request personally.</p>

      {intake ? (
        <div className="my-intake-summary">
          <span>{intake.dob}</span>
          <span>{intake.birth_time_unknown ? "time to rectify" : intake.birth_time ?? "—"}</span>
          <span>{intake.birth_place}</span>
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <label className="my-field">
          <span>Preferred windows</span>
          <input type="text" value={windows} onChange={(e) => setWindows(e.target.value)} placeholder="e.g. weekday evenings IST" required />
        </label>
        <label className="my-field">
          <span>Topic for this session <em>(optional)</em></span>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. 10th-house career timing" />
        </label>
        {error ? <div className="my-form-error">{error}</div> : null}
        <button type="submit" className="price-cta" disabled={!canSubmit} data-state={busy ? "starting" : "idle"}>
          {busy ? "Sending…" : "Request session →"}
        </button>
      </form>

      {bookings.length > 0 ? (
        <div className="my-booking-list">
          {bookings.map((b) => (
            <div key={b.id} className="my-booking-row">
              <div>
                <div className="my-booking-windows">{b.preferred_windows}</div>
                {b.topic ? <div className="my-booking-topic">{b.topic}</div> : null}
              </div>
              <span className={`my-booking-status status-${b.status}`}>
                {STATUS_LABEL[b.status] ?? b.status}
                {statusMoment(b) ? <em className="my-booking-when"> · {statusMoment(b)}</em> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function MyrologyUnlockedPanel() {
  const { phase } = useMyrology()
  if (phase === "intake") return <IntakeForm />
  if (phase === "booking") return <BookingPanel />
  return null
}
