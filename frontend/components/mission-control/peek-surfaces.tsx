"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Target, TrendingUp, Building2, Radar, ArrowRight, Check } from "lucide-react"
import { jobs as jobsApi, users as usersApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
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
      <SkillGapsCard token={token} />
      <FollowedCard token={token} />
      <IntelCard token={token} />
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
                <ArrowRight size={12} aria-hidden className="go" />
              </Link>
            </li>
          ) : (
            <li key={s.label} className="mc-peek-row is-open">
              <span className="dot" aria-hidden /> <span>{s.label}</span>
            </li>
          ),
        )}
      </ul>
    </PeekCard>
  )
}

/* ── 2 · Skill gaps (live market demand for your skills) ────────── */
function SkillGapsCard({ token }: { token: string }) {
  const { data } = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobsApi.mySkillDemand(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const gaps = (data?.skills ?? []).filter((s) => s.needs_upgrade).slice(0, 3)
  return (
    <PeekCard icon={<TrendingUp size={15} />} title="Skill gaps" href="/skills" hrefLabel="See your skill map">
      {gaps.length === 0 ? (
        <p className="mc-peek-empty">No pressing gaps — your skills track the market. Keep practising to climb.</p>
      ) : (
        <ul className="mc-peek-list">
          {gaps.map((g) => (
            <li key={g.skill} className="mc-peek-gap">
              <span className="lab">{g.display_name}</span>
              <span className="mc-peek-lvl">L{g.current_level}{g.target_level != null ? `→${g.target_level}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </PeekCard>
  )
}

/* ── 3 · Followed companies ─────────────────────────────────────── */
function FollowedCard({ token }: { token: string }) {
  const { data } = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => usersApi.followedCompanies(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const companies = data?.companies ?? []
  return (
    <PeekCard icon={<Building2 size={15} />} title="Followed companies" href="/intel" hrefLabel={companies.length ? "Open intel heatmap" : "Browse companies"}>
      {companies.length === 0 ? (
        <p className="mc-peek-empty">Star a company to track which skills it hires for most.</p>
      ) : (
        <ul className="mc-peek-chips">
          {companies.slice(0, 6).map((c) => (
            <li key={c.company_name} className="mc-peek-chip">{c.company_name}</li>
          ))}
        </ul>
      )}
    </PeekCard>
  )
}

/* ── 4 · Latest intel shortcut ──────────────────────────────────── */
function IntelCard({ token }: { token: string }) {
  const { data } = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobsApi.mySkillDemand(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const top = [...(data?.skills ?? [])].sort((a, b) => b.weighted_demand - a.weighted_demand)[0]
  return (
    <PeekCard icon={<Radar size={15} />} title="Live intel" href="/intel" hrefLabel="Where to invest">
      {top ? (
        <p className="mc-peek-intel">
          Most in-demand right now: <strong>{top.display_name}</strong>
          {top.job_count_30d ? <span className="mc-peek-intel-meta"> · {top.job_count_30d} open roles</span> : null}
        </p>
      ) : (
        <p className="mc-peek-empty">See which skills the live market is hiring for hardest.</p>
      )}
    </PeekCard>
  )
}
