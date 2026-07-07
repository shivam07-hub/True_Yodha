"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Target, TrendingUp, Building2, ArrowRight, Check, Coins } from "lucide-react"
import { jobs as jobsApi, users as usersApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { DomainRadar } from "@/components/skills/domain-radar"
import type { LoopStep } from "./loop-ring"

/**
 * The four glanceable surfaces that fill the desktop workspace's right zone and
 * the mobile peek strip. ONE content model, two geometries (D5/D6): the caller
 * supplies the container (vertical rail vs horizontal strip); the cards are
 * identical. Each card self-fetches its own cheap read so the panel degrades
 * surface-by-surface and never blocks the feed.
 */
export function PeekSurfaces({ token, steps }: { token: string; steps: LoopStep[] }) {
  return (
    <>
      <MissionsCard steps={steps} />
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
  href: string
  hrefLabel: string
  children: ReactNode
}) {
  return (
    <section className="mc-peek-card">
      <header className="mc-peek-head">
        <span className="mc-peek-ico" aria-hidden>{icon}</span>
        <h3 className="mc-peek-title">{title}</h3>
      </header>
      <div className="mc-peek-body">{children}</div>
      <Link href={href} className="mc-peek-link tm-control-focus">
        {hrefLabel} <ArrowRight size={13} aria-hidden />
      </Link>
    </section>
  )
}

/* ── 1 · Today's missions (from the daily-loop steps) ───────────── */
function MissionsCard({ steps }: { steps: LoopStep[] }) {
  const open = steps.filter((s) => !s.done)
  const done = steps.length - open.length
  return (
    <PeekCard icon={<Target size={15} />} title="Today's missions" href="/forge" hrefLabel="Open practice yard">
      <div className="mc-peek-progress">
        <span className="mc-peek-prog-num">{done}/{steps.length}</span>
        <span className="mc-peek-prog-track"><span className="fill" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} /></span>
      </div>
      <ul className="mc-peek-list">
        {steps.slice(0, 4).map((s) =>
          s.done ? (
            <li key={s.label} className="mc-peek-row is-done">
              <Check size={13} aria-hidden /> <span>{s.label}</span>
            </li>
          ) : s.href ? (
            <li key={s.label}>
              <Link href={s.href} className="mc-peek-row is-open tm-control-focus">
                <span className="dot" aria-hidden /> <span>{s.label}</span>
                {s.reward ? (
                  <span className="mc-peek-reward"><Coins size={11} aria-hidden /> {s.reward}</span>
                ) : null}
                <ArrowRight size={12} aria-hidden className="go" />
              </Link>
            </li>
          ) : (
            <li key={s.label} className="mc-peek-row is-open">
              <span className="dot" aria-hidden /> <span>{s.label}</span>
              {s.reward ? (
                <span className="mc-peek-reward"><Coins size={11} aria-hidden /> {s.reward}</span>
              ) : null}
            </li>
          ),
        )}
      </ul>
    </PeekCard>
  )
}

/* ── Skill map (live domain radar — the /skills artifact, inline) ───────
 * Relocated off the /home dashboard rail onto the Jobs (/market) rail — see
 * app/(authed)/market/page.tsx. Exported so /market mounts it under the
 * greeting hero; the shared React Query keys dedupe its reads. */
export function SkillMapCard({ token }: { token: string }) {
  const { data: demand } = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobsApi.mySkillDemand(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const { data: skills } = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => usersApi.mySkills(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const hasRadar = !!skills && Object.keys(skills.by_domain).length > 0
  const topGap = (demand?.skills ?? []).find((s) => s.needs_upgrade)
  return (
    <PeekCard icon={<TrendingUp size={15} />} title="Skill map" href="/forge?view=audit" hrefLabel="Open skill audit">
      {hasRadar ? (
        <Link href="/forge?view=audit" className="mc-peek-radar tm-control-focus" aria-label="Open your skill audit">
          <DomainRadar userSkills={skills} />
          <span className="mc-peek-radar-cap">
            {topGap
              ? <>Biggest gap: <strong>{topGap.display_name}</strong> · L{topGap.current_level}{topGap.target_level != null ? `→${topGap.target_level}` : ""}</>
              : "Your skills track the market — keep practising to climb."}
          </span>
        </Link>
      ) : (
        <p className="mc-peek-empty">Upload a CV to map your skills across the 12 career domains.</p>
      )}
    </PeekCard>
  )
}

/* ── 3 · Followed companies (absorbed the old "Live intel" card — both linked
 * to the same heatmap from the same demand read, so they were one surface
 * wearing two frames; the top-demand line now lives here). ─────────────── */
function FollowedCard({ token }: { token: string }) {
  const { data } = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => usersApi.followedCompanies(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const { data: demand } = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobsApi.mySkillDemand(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const companies = data?.companies ?? []
  const top = [...(demand?.skills ?? [])].sort((a, b) => b.weighted_demand - a.weighted_demand)[0]
  return (
    <PeekCard icon={<Building2 size={15} />} title="Followed companies" href={companies.length ? "/market?tab=heatmap" : "/intel"} hrefLabel={companies.length ? "Open intel heatmap" : "Browse companies"}>
      {companies.length === 0 ? (
        <p className="mc-peek-empty">Star a company to track which skills it hires for most.</p>
      ) : (
        <ul className="mc-peek-chips">
          {companies.slice(0, 6).map((c) => (
            <li key={c.company_name} className="mc-peek-chip">{c.company_name}</li>
          ))}
        </ul>
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
