"use client"

import { useState, type FormEvent } from "react"

import { useMyrology } from "./checkout"
import { formatDate } from "@/lib/format"

/* 1c — the quiet days between paying and receiving.
 *
 * The state that usually goes undesigned, and the one where a paid native most
 * needs to see that something is happening. Three things carry it: a delivery
 * date computed from the verified payment, a pipeline that only claims the
 * stages we can actually observe, and a plain receipt of every field stored.
 *
 * The pipeline deliberately has no percentage and no "writing your map now"
 * step. Nothing reports back from the astrologer's desk, so a progress bar here
 * would be animation over an unknown. */

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  done: "Delivered",
  cancelled: "Cancelled",
}

function statusMoment(b: {
  status: string
  confirmed_at: string | null
  done_at: string | null
  cancelled_at: string | null
}): string | null {
  const iso = b.status === "done" ? b.done_at : b.status === "confirmed" ? b.confirmed_at : b.status === "cancelled" ? b.cancelled_at : null
  if (!iso) return null
  return formatDate(iso, "short")
}

function DeliveryPromise() {
  const { order } = useMyrology()
  if (!order) return null

  return (
    <div className="order-promise">
      <div className="order-promise-tag">YOUR WRITTEN MAP</div>
      <div className="order-promise-date">
        with you by <span className="order-promise-em">{formatDate(order.promised_by, "long")}</span>
      </div>
      <div className="order-pipeline">
        <div className="order-stage" data-state="done">
          <span className="order-stage-name">Payment received</span>
          <span className="order-stage-when mono">{formatDate(order.paid_at, "short")}</span>
        </div>
        <div className="order-stage" data-state="active">
          <span className="order-stage-name">With the astrologer</span>
          <span className="order-stage-when mono">{order.working_days} working days</span>
        </div>
        <div className="order-stage" data-state="waiting">
          <span className="order-stage-name">Map delivered by email</span>
          <span className="order-stage-when mono">{formatDate(order.promised_by, "short")}</span>
        </div>
      </div>
    </div>
  )
}

function DataReceipt() {
  const { intake } = useMyrology()
  if (!intake) return null

  return (
    <div className="order-receipt">
      <div className="order-receipt-tag">WHAT WE HOLD</div>
      <dl className="order-receipt-list">
        <div><dt>Date of birth</dt><dd className="mono">{intake.dob}</dd></div>
        <div>
          <dt>Time of birth</dt>
          <dd className="mono">{intake.birth_time_unknown ? "unknown — to rectify" : intake.birth_time ?? "—"}</dd>
        </div>
        <div><dt>Place of birth</dt><dd className="mono">{intake.birth_place}</dd></div>
        {intake.guidance_note ? (
          <div><dt>Guidance sought</dt><dd>{intake.guidance_note}</dd></div>
        ) : null}
      </dl>
      <p className="order-receipt-foot">
        No name is attached to the chart. Delete all of it any time from Settings → Data.
      </p>
    </div>
  )
}

export function OrderPanel() {
  const { bookings, createBooking } = useMyrology()
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
      <div className="my-confirm-banner">
        <div className="my-confirm-check" aria-hidden="true">✦</div>
        <div>
          <div className="my-confirm-title">Payment received.</div>
          <div className="my-confirm-text">Your chart is with the astrologer.</div>
        </div>
      </div>

      <DeliveryPromise />

      <div className="my-panel-eyebrow"><span className="dot pulse" /> UNLOCKED · YOUR 3 SESSIONS</div>
      <h3 className="my-panel-title">Request a session.</h3>
      <p className="my-panel-sub">
        3 one-on-one sessions across your life. One astrologer, limited slots per day — he confirms
        each request personally.
      </p>

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

      <DataReceipt />
    </div>
  )
}
