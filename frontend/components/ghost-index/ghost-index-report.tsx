import Link from "next/link"
import { formatCount, formatDate } from "@/lib/format"
import type { GhostIndexResponse, GhostIndexRow } from "@/lib/api"
import { formatDays as days, formatRate as pct, rateBand as band } from "@/lib/ghost-index/rate"
import "./ghost-index.css"

/**
 * The Ghost Job Index report.
 *
 * Named employers appear here, so every figure carries the count it was taken
 * over and nothing is rounded into a claim the evidence does not support. The
 * page states what was OBSERVED — a role gone from the employer's ATS while
 * their feed still carries the ad — and never asserts intent.
 *
 * Server component: no interactivity, so a crawler and a reader with no JS see
 * the whole index. The severity marker uses the status tokens, not the accent:
 * it encodes a value, and colour here is information.
 */

function Rate({ rate }: { rate: number | null }) {
  return (
    <span className="gi-rate">
      <span className={`gi-band gi-band-${band(rate)}`} aria-hidden />
      <span className="gi-rate-n">{pct(rate)}</span>
    </span>
  )
}

function ScopeTable({
  rows,
  caption,
  label,
}: {
  rows: GhostIndexRow[]
  caption: string
  label: string
}) {
  if (rows.length === 0) return null
  return (
    <div className="gi-table-wrap">
      <table className="gi-table">
        <caption className="gi-caption">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col" className="gi-num">Still advertised</th>
            <th scope="col" className="gi-num">Closed roles watched</th>
            <th scope="col" className="gi-num">Days up since close</th>
            <th scope="col" className="gi-num">Ads pulled</th>
            <th scope="col" className="gi-num">Days to pull</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.scope_key}>
              <th scope="row">{r.scope_key}</th>
              <td className="gi-num"><Rate rate={r.still_advertised_rate} /></td>
              <td className="gi-num">
                {formatCount(r.still_advertised)} of {formatCount(r.feed_overlap)}
              </td>
              <td className="gi-num">{days(r.avg_days_still_advertised)}</td>
              <td className="gi-num">{formatCount(r.ad_pulled_after_close)}</td>
              <td className="gi-num">{days(r.median_days_to_pull)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function GhostIndexReport({ data }: { data: GhostIndexResponse }) {
  const { overall, coverage } = data
  const rate = overall.still_advertised_rate

  return (
    <article className="gi-root tm-page-enter">
      <header className="gi-head">
        <p className="gi-eyebrow">
          Verification ledger
          <span className="gi-stamp">
            {data.method} · {formatDate(data.computed_at, "medium")}
          </span>
        </p>
        <h1 className="gi-title">Ghost Job Index</h1>
        <p className="gi-lede">
          When an employer&apos;s own hiring system stops serving a role, does the
          employer&apos;s own careers feed stop advertising it? For most of the
          listings we can watch on both sides, the answer is no.
        </p>
      </header>

      <section className="gi-headline" aria-label="Headline finding">
        <div className="gi-stat gi-stat-lead">
          <span className="gi-stat-n">{pct(rate)}</span>
          <span className="gi-stat-l">
            of closed roles are still advertised
            <span className="gi-stat-sub">
              {formatCount(overall.still_advertised)} of {formatCount(overall.feed_overlap)} watched on both sides
            </span>
          </span>
        </div>
        <div className="gi-stat">
          <span className="gi-stat-n">{days(overall.avg_days_still_advertised)}</span>
          <span className="gi-stat-l">
            average time the ad has stayed up
            <span className="gi-stat-sub">counted to our latest crawl, so it is a floor</span>
          </span>
        </div>
        <div className="gi-stat">
          <span className="gi-stat-n">{days(overall.median_days_to_pull)}</span>
          <span className="gi-stat-l">
            median time to pull, where it was pulled
            <span className="gi-stat-sub">{formatCount(overall.ad_pulled_after_close)} listings taken down</span>
          </span>
        </div>
      </section>

      <section className="gi-note" aria-label="What this measures">
        <h2 className="gi-h2">What this measures</h2>
        <p>
          Myro reads job listings from employer hiring systems directly, then
          re-checks each one at its source. Two signals come back: whether the
          role is still being served by the hiring system, and whether it is
          still present in the careers feed the employer publishes.
        </p>
        <p>
          A listing counts here only when both signals are conclusive. The index
          reports what was seen, not why. An ad left up after a role closes may
          be an oversight, a slow feed, or a role that reopened without our
          seeing it. <Link className="tm-link" href="/ghost-index/method">Read the method</Link>.
        </p>
      </section>

      <ScopeTable
        rows={data.companies}
        label="Employer"
        caption="By employer, highest share still advertised first"
      />

      <ScopeTable
        rows={data.sectors}
        label="Sector"
        caption="By sector"
      />

      {data.months.length > 0 && (
        <ScopeTable
          rows={data.months.map((m) => ({ ...m, scope_key: m.period }))}
          label="Month closed"
          caption="By the month we first saw the role close"
        />
      )}

      <section className="gi-coverage" aria-label="Coverage">
        <h2 className="gi-h2">What this does not cover</h2>
        <ul className="gi-facts">
          <li>
            <b>{formatCount(coverage.companies_published)}</b> employers are
            published, of{" "}
            <b>{formatCount(coverage.companies_with_closures)}</b> with any
            closed role
            {coverage.companies_in_corpus !== null && (
              <> and <b>{formatCount(coverage.companies_in_corpus)}</b> tracked in total</>
            )}. An employer appears only after {coverage.min_cell} of its closed
            roles have been watched on both sides. Below that a share is noise,
            so it is withheld rather than printed.
          </li>
          <li>
            <b>{formatCount(overall.listings_inconclusive ?? 0)}</b> listings
            reached no verdict at all. A hiring system that rate-limits our
            checks, or a listing address that never resolved, is not evidence a
            role ended.
          </li>
          <li>
            <b>{formatCount(overall.listings_closed)}</b> roles are confirmed
            closed and{" "}
            <b>{formatCount(overall.listings_live ?? 0)}</b> confirmed live. Only
            the closed roles that also appear in a careers feed can be judged
            here, which is why the table totals are smaller.
          </li>
        </ul>
        <p className="gi-correct">
          Employers: if a figure here is wrong, we will check it against the
          evidence and publish the correction. Write to{" "}
          <a className="tm-link" href="mailto:hello@himyro.com">hello@himyro.com</a>.
        </p>
      </section>
    </article>
  )
}
