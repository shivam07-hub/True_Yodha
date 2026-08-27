"use client"

import { formatCount } from "@/lib/format"

import { useMarketLens } from "./use-market-lens"

/* The market half of the two lenses: the same query, run against today's index.
 *
 * The specimen wheel beside this points at analytics and data work, so this
 * panel answers that specific question with real counts — including the case
 * that argues AGAINST the chart. The largest domain in the corpus is shown
 * whatever it happens to be, labelled as volume rather than fit, because a
 * reading that only ever agrees with itself is not a second opinion.
 *
 * Every figure resolves through the index. Nothing here is authored. */

const LEAD_DOMAIN = "Data & Analytics"

export function LiveLensPanel() {
  const { roleDomains, jobsTracked, asOf, ready } = useMarketLens()

  const lead = roleDomains.find((d) => d.name === LEAD_DOMAIN) ?? roleDomains[0] ?? null
  // Whatever is actually biggest, excluding the lead — the volume-is-not-fit case.
  const counter = roleDomains.find((d) => d.name !== lead?.name) ?? null
  const rest = roleDomains.filter((d) => d.name !== lead?.name && d.name !== counter?.name).slice(0, 5)

  if (!ready || !lead) {
    return (
      <div className="lens-card lens-card--live">
        <div className="lens-tag lens-tag--live"><span className="dot pulse" />MYRO LIVE DATA</div>
        <div className="live-pending">Reading today&rsquo;s index…</div>
      </div>
    )
  }

  return (
    <div className="lens-card lens-card--live">
      <div className="lens-tag lens-tag--live"><span className="dot pulse" />MYRO LIVE DATA</div>
      <p className="live-lens-sub">
        Same question, run against today&rsquo;s index. Real counts, not a reading.
      </p>

      <div className="mkt-card mkt-card--lead">
        <div className="mkt-head">
          <span className="mkt-name">{lead.name}</span>
          <span className="mkt-count mono">{formatCount(lead.jobs)}</span>
        </div>
        <p className="mkt-body">
          Where the specimen chart points. Open roles in this domain right now, across every
          industry group in the index.
        </p>
      </div>

      {counter ? (
        <div className="mkt-card">
          <div className="mkt-head">
            <span className="mkt-name">{counter.name}</span>
            <span className="mkt-count mkt-count--muted mono">{formatCount(counter.jobs)}</span>
          </div>
          <p className="mkt-body">
            Hiring harder — and the chart argues against it. Volume is not fit. Shown so you can
            disagree with us.
          </p>
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="mkt-rest">
          <div className="mkt-rest-tag">THE REST OF THE MARKET</div>
          {rest.map((d) => (
            <div key={d.name} className="mkt-rest-row">
              <span>{d.name}</span>
              <span className="mono">{formatCount(d.jobs)}</span>
            </div>
          ))}
          <div className="mkt-rest-row mkt-rest-row--total">
            <span>Every verified opening</span>
            <span className="mono live-em">{formatCount(jobsTracked)}</span>
          </div>
        </div>
      ) : null}

      {asOf ? (
        <p className="mkt-foot">
          A chart cannot be checked. A count can — so we date it, and when the two lenses disagree
          we print both rather than blending them into one number.
        </p>
      ) : null}
    </div>
  )
}
