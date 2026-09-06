import Link from "next/link"
import { formatCount, formatDate } from "@/lib/format"
import type { HiringPanelResponse, HiringSector } from "@/lib/api"
import "./hiring-panel.css"

/**
 * The sector hiring panel.
 *
 * Two readers, one page. A recruiter or an EdTech buyer wants to know where the
 * hiring is and whether the postings are real; a jobseeker wants the same two
 * things about their own sector. Neither is served by a chart with no counts,
 * so every figure here arrives with the population behind it.
 *
 * Server component: a crawler with no JS sees every sector and every number,
 * which is the point of publishing it at all.
 */

function pct(rate: number | null): string {
  if (rate === null) return "—"
  if (rate === 1) return "100%"
  if (rate === 0) return "0%"
  return `${Math.min(99, Math.max(1, Math.round(rate * 100)))}%`
}

/** Share of a sector's live roles posted in the last 30 days. */
function Momentum({ sector }: { sector: HiringSector }) {
  const share = sector.new_share ?? 0
  return (
    <div className="hp-momentum">
      <div className="hp-bar" aria-hidden>
        <span style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
      </div>
      <span className="hp-momentum-n">
        {pct(sector.new_share)} posted in the last 30 days
        <span className="hp-sub">
          {formatCount(sector.new_roles_30d)} of {formatCount(sector.live_roles)}
        </span>
      </span>
    </div>
  )
}

function Chips({ items, label }: { items: { name: string; roles: number }[]; label: string }) {
  if (items.length === 0) return null
  return (
    <div className="hp-chips">
      <span className="hp-chips-label">{label}</span>
      <ul>
        {items.map((item) => (
          <li key={item.name}>
            {item.name}
            <span className="hp-chip-n">{formatCount(item.roles)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sector({ sector }: { sector: HiringSector }) {
  return (
    <article className="hp-sector">
      <header className="hp-sector-head">
        <h2 className="hp-sector-name">{sector.sector}</h2>
        <dl className="hp-figures">
          <div>
            <dt>Live roles</dt>
            <dd>{formatCount(sector.live_roles)}</dd>
          </div>
          <div>
            <dt>Employers</dt>
            <dd>{formatCount(sector.employers)}</dd>
          </div>
          <div>
            <dt>Role families</dt>
            <dd>{formatCount(sector.role_families)}</dd>
          </div>
          <div>
            <dt>Still advertised</dt>
            <dd>{pct(sector.still_advertised_rate)}</dd>
          </div>
        </dl>
      </header>

      <Momentum sector={sector} />

      <Chips items={sector.top_roles.slice(0, 6)} label="Most-hired roles" />
      <Chips items={sector.top_skills.slice(0, 8)} label="Most-asked skills" />
    </article>
  )
}

export function HiringPanel({ data }: { data: HiringPanelResponse }) {
  const { coverage } = data
  return (
    <article className="hp-root tm-page-enter">
      <header className="hp-head">
        <p className="hp-eyebrow">
          Hiring panel
          <span className="hp-stamp">
            {data.method} · {formatDate(data.computed_at, "medium")}
          </span>
        </p>
        <h1 className="hp-title">What is hiring in India, by sector</h1>
        <p className="hp-lede">
          Read from employer hiring systems directly, not from job boards, and
          re-checked at the source. Every figure carries the number of roles
          behind it.
        </p>
        <p className="hp-note">
          <b>Still advertised</b> is the share of that sector&apos;s closed roles
          still sitting in the employer&apos;s own feed, from the{" "}
          <Link className="tm-link" href="/ghost-index">Ghost Job Index</Link>. This
          page says what is open; that one says whether to believe it. A dash
          means the index withheld the sector for too few observations, not that
          the sector is clean.
        </p>
      </header>

      <div className="hp-sectors">
        {data.sectors.map((sector) => (
          <Sector key={sector.sector} sector={sector} />
        ))}
      </div>

      <section className="hp-coverage">
        <h2 className="hp-h2">What this does not cover</h2>
        <ul className="hp-facts">
          <li>
            <b>{formatCount(coverage.sectors_published)}</b> sectors are
            published of <b>{formatCount(coverage.sectors_tracked)}</b> tracked,
            covering <b>{formatCount(coverage.live_roles_published)}</b> of{" "}
            <b>{formatCount(coverage.live_roles_tracked)}</b> live roles. A
            sector appears only with at least {coverage.min_live_roles} live
            roles and {coverage.min_employers} employers. Below that a panel
            describes a handful of postings at one company.
          </li>
          <li>
            This is a panel of tracked employers, not a census of Indian hiring.
            It is deep rather than wide, and a sector&apos;s numbers move when we
            add an employer as well as when the market does.
          </li>
          <li>
            A listing with no sector on it is excluded rather than bucketed into
            an &quot;Other&quot; row. Unclassified is missing data, not a sector.
          </li>
        </ul>
      </section>
    </article>
  )
}
