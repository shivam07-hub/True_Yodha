"use client"

import { formatCount, formatDateTime } from "@/lib/format"
import { useMarketLens } from "./use-market-lens"

/* The teal half of the hero: what a chart would actually be matched against.
 *
 * Nothing here is authored. Counts, group names and the taxonomy sizes all come
 * from the same index that powers Jobs, so a visitor can check any number on
 * this card against /intel. While the query is in flight the card shows its
 * frame and no figures — a zero would read as a fact. */

export function LiveIndexPanel() {
  const { jobsTracked, industryGroups, totalIndustries, roleFamilies, asOf, ready, taxonomyReady } = useMarketLens()
  // Rendered in the reader's own zone, like every other timestamp in the app —
  // so the stamp carries no zone suffix.
  const stamp = asOf ? formatDateTime(asOf) : ""
  const widest = industryGroups[0]?.jobs ?? 0

  return (
    <div className="lens-card lens-card--live">
      <div className="lens-tag lens-tag--live">
        <span className="dot pulse" />
        MYRO LIVE DATA{stamp ? ` · ${stamp}` : ""}
      </div>

      {ready ? (
        <>
          <div className="live-headline">
            <span className="live-count mono">{formatCount(jobsTracked)}</span>
            <span className="live-unit">open roles</span>
          </div>
          {taxonomyReady ? (
            <div className="live-sub">
              across <span className="mono live-em">{totalIndustries}</span> normalised industry
              groups and <span className="mono live-em">{roleFamilies}</span> role families.
            </div>
          ) : null}

          <div className="live-bars">
            {industryGroups.map((g) => (
              <div key={g.name} className="live-bar">
                <div className="live-bar-head">
                  <span>{g.name}</span>
                  <span className="mono live-em">{formatCount(g.jobs)}</span>
                </div>
                <div className="live-bar-track">
                  <div
                    className="live-bar-fill"
                    style={{ width: widest > 0 ? `${Math.max(4, (g.jobs / widest) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="live-pending">Reading today&rsquo;s index…</div>
      )}
    </div>
  )
}
