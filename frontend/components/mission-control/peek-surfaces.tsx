"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Radar, Building2, ArrowRight } from "lucide-react"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"
import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"
import { CompanySignalChip } from "@/components/companies/company-signal"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"

/**
 * The four glanceable surfaces that fill the desktop workspace's right zone and
 * the mobile peek strip. ONE content model, two geometries (D5/D6): the caller
 * supplies the container (vertical rail vs horizontal strip); the cards are
 * identical. Each card self-fetches its own cheap read so the panel degrades
 * surface-by-surface and never blocks the feed.
 */
export function PeekSurfaces({ token }: { token: string }) {
  return (
    <>
      <ProvenanceCard token={token} />
      <FollowedCard token={token} />
    </>
  )
}

/* ── Card frame ─────────────────────────────────────────────────── */
function PeekCard({
  icon,
  title,
  href,
  hrefLabel,
  children,
}: {
  icon: ReactNode
  title: string
  href?: string
  hrefLabel?: string
  children: ReactNode
}) {
  return (
    <section className="mc-peek-card">
      <header className="mc-peek-head">
        <span className="mc-peek-ico" aria-hidden>{icon}</span>
        <h3 className="mc-peek-title">{title}</h3>
      </header>
      <div className="mc-peek-body">{children}</div>
      {href ? (
        <Link href={href} className="mc-peek-link tm-control-focus">
          {hrefLabel} <ArrowRight size={13} aria-hidden />
        </Link>
      ) : null}
    </section>
  )
}

/* ── 1 · Where these jobs come from — the provenance card.
 *
 * Replaced the daily-loop ring in this slot (2026-08-06). The ring graded the
 * user on five "steps", two of which the platform performed for them (a match
 * existing, a score moving), then printed their streak underneath — a scoreboard
 * for a game nobody opted into, on a rail that already carries a checklist above
 * it and a Next chip in the topbar.
 *
 * This says something the user cannot get anywhere else: the pool is not a
 * magic feed, it is a crawler plus people, and we only claim a listing is alive
 * if we opened it recently. Numbers carry it — no explanatory sentence. */
function ProvenanceCard({ token }: { token: string }) {
  const { data } = useQuery({
    queryKey: dataKeys.jobContributions(),
    queryFn: () => jobsApi.contributions(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  if (!data || data.total === 0) {
    return (
      <PeekCard icon={<Radar size={15} />} title="Where these jobs come from">
        <p className="mc-peek-empty">Myro is counting the pool — one moment.</p>
      </PeekCard>
    )
  }

  const { total, agent, community, verified_live: verifiedLive, mine } = data
  const verifiedPct = Math.min((verifiedLive / total) * 100, 100)
  const agentPct = (agent / total) * 100

  return (
    <PeekCard icon={<Radar size={15} />} title="Where these jobs come from">
      <div className="mc-prov-hero">
        <span className="mc-prov-num">{formatCount(verifiedLive)}</span>
        <span className="mc-prov-cap">verified live · {data.verified_window_days}d</span>
      </div>

      {/* Checked vs unchecked. The empty remainder is the honest part — a
          listing we have not opened recently is not counted as alive. */}
      <div className="mc-prov-bar" role="img" aria-label={`${verifiedLive} of ${total} listings verified live in the last ${data.verified_window_days} days`}>
        <span className="mc-prov-fill" style={{ width: `${verifiedPct}%` }} />
      </div>
      <p className="mc-prov-sub">of {formatCount(total)} tracked</p>

      {/* Same denominator, cut by who put the job here. */}
      <div className="mc-prov-bar" role="img" aria-label={`${agent} listings from the Myro agent, ${community} from people using Myro`}>
        <span className="mc-prov-seg-agent" style={{ width: `${agentPct}%` }} />
        <span className="mc-prov-seg-community" style={{ flex: 1 }} />
      </div>
      <div className="mc-prov-key">
        <span className="mc-prov-key-item">
          <span className="mc-prov-dot mc-prov-dot--agent" aria-hidden />
          Myro agent <b>{formatCount(agent)}</b>
        </span>
        <span className="mc-prov-key-item">
          <span className="mc-prov-dot mc-prov-dot--community" aria-hidden />
          People like you <b>{formatCount(community)}</b>
        </span>
      </div>

      {mine > 0 ? (
        <p className="mc-prov-mine">
          You added <b>{formatCount(mine)}</b>
        </p>
      ) : null}

      <a
        className="mc-peek-link tm-control-focus"
        href={EXTENSION_WEBSTORE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Add jobs as you browse <ArrowRight size={13} aria-hidden />
      </a>
    </PeekCard>
  )
}

/* ── 2 · Followed companies (absorbed the old "Live intel" card — both linked
 * to the same heatmap from the same demand read, so they were one surface
 * wearing two frames; the top-demand line now lives here). ─────────────── */
function FollowedCard({ token }: { token: string }) {
  const following = useFollowCompany(token)
  const { data: demand } = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobsApi.mySkillDemand(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const companies = following.companies
  const top = [...(demand?.skills ?? [])].sort((a, b) => b.weighted_demand - a.weighted_demand)[0]
  return (
    <PeekCard icon={<Building2 size={15} />} title="Followed companies" href="/intel" hrefLabel={companies.length ? "Open Intel" : "Browse companies"}>
      {companies.length === 0 ? (
        <p className="mc-peek-empty">Follow a company to compare which skills it hires for most.</p>
      ) : (
        <div className="mc-peek-chips">
          {companies.slice(0, 6).map((c) => (
            <CompanySignalChip
              key={c.company_name}
              name={c.company_name}
              followed
              href={`/companies/${encodeURIComponent(c.company_name)}`}
            />
          ))}
        </div>
      )}
      {top ? (
        <p className="mc-peek-intel">
          Most in-demand right now: <strong>{top.display_name}</strong>
          {top.job_count_30d ? <span className="mc-peek-intel-meta"> · {top.job_count_30d} open roles</span> : null}
        </p>
      ) : null}
    </PeekCard>
  )
}
