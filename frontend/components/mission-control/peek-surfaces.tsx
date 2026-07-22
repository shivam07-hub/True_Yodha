"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Target, TrendingUp, Building2, ArrowRight } from "lucide-react"
import { jobs as jobsApi, users as usersApi, scores, diary, upskilling } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useScoreMapData } from "@/lib/hooks/use-score-map-data"
import { buildScoreMap, buildScoreMapHref } from "@/lib/score-map"
import { DomainRadar } from "@/components/skills/domain-radar"
import { CompanySignalChip } from "@/components/companies/company-signal"
import { computeStreakFromDates, type DiaryEntry } from "@/lib/forge-helpers"
import { LoopRing, type LoopStep } from "./loop-ring"

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
      <MissionsCard token={token} steps={steps} />
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

/* ── 1 · Today's loop — the same Apple-Activity-style ring the home hero
 * used, moved here so it reads as a closing loop (five segments) instead of a
 * flat checklist. Self-fetches score/streak/sessions like its rail siblings;
 * the ring's own nudge line already names the next open step, so this card
 * skips the generic footer link the other peek cards carry. */
function MissionsCard({ token, steps }: { token: string; steps: LoopStep[] }) {
  const { data: scoreData } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const { data: history } = useQuery({
    queryKey: dataKeys.diary(),
    queryFn: () => diary.history(token),
    enabled: !!token,
  })
  const { data: activity } = useQuery({
    queryKey: ["practice-activity-dates", token],
    queryFn: () => upskilling.activityDates(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const entries = (history?.entries ?? []) as DiaryEntry[]
  return (
    <PeekCard icon={<Target size={15} />} title="Today's loop">
      <LoopRing
        score={Math.round(scoreData?.total_score ?? 0)}
        scoreDelta={0}
        streak={computeStreakFromDates(activity?.dates ?? [])}
        sessions={entries.length}
        steps={steps}
      />
    </PeekCard>
  )
}

/* ── Skill map (live domain radar — the /skills artifact, inline) ───────
 * Relocated off the /home dashboard rail onto the Jobs (/market) rail — see
 * app/(authed)/market/page.tsx. Exported so /market mounts it under the
 * greeting hero; the shared React Query keys dedupe its reads. */
export function SkillMapCard({ token }: { token: string }) {
  const { score, skills } = useScoreMapData(token)
  const hasRadar = !!score && Object.keys(score.domain_scores).length > 0
  const model = score && skills ? buildScoreMap(score, skills) : null
  const topGap = model?.topMove
  const href = buildScoreMapHref({ domain: model?.selected?.domain, skill: topGap?.skill })
  return (
    <PeekCard icon={<TrendingUp size={15} />} title="Score map" href={href} hrefLabel="See why and what moves it">
      {hasRadar ? (
        <Link href={href} className="mc-peek-radar tm-control-focus" aria-label="Open your Score map">
          <DomainRadar domainScores={score.domain_scores} />
          <span className="mc-peek-radar-cap">
            {topGap
              ? <>Highest verified lift: <strong>{topGap.skill}</strong> · +{topGap.gain}</>
              : "Your skills track the market — keep practising to climb."}
          </span>
        </Link>
      ) : (
        <p className="mc-peek-empty">Upload a CV to map the skill evidence behind your Myro Score.</p>
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
