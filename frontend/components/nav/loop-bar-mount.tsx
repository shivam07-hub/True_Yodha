"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type JobMatchesResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { chipCounts, isApplied, matchesById } from "@/lib/collections/model"
import { openRefreshGate } from "@/store/refreshGateStore"
import { LoopBar, type LoopBarModel } from "./loop-bar"

/**
 * Mounts the Loop Bar (journey B) globally under the desktop topbar, but only on
 * the surfaces where the job-search loop is the active task (Jobs / Collections /
 * Tailor / Applications) — showing it on Skills, Forge or Newsletter would be
 * chrome noise, not orientation.
 *
 * Data is deliberately cheap: it fetches `applications` (small, and shares the
 * Collections cache via dataKeys.applications) and only READS cached matches
 * (passive subscription, never a fetch) for the fit % on the "next" magnet and
 * the "N new" signal on Capture.
 */

const LOOP_ROUTES = ["/market", "/collections", "/cv/tailor", "/applications"]

function activeStep(pathname: string): number {
  if (pathname.startsWith("/collections")) return 1
  if (pathname.startsWith("/cv/tailor")) return 2
  if (pathname.startsWith("/applications")) return 3
  return 0 // /market and anything else on the loop
}

export function LoopBarMount({ token }: { token: string }) {
  const pathname = usePathname()
  const onLoop = LOOP_ROUTES.some((r) => pathname.startsWith(r))
  const onMarket = pathname.startsWith("/market")

  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: onLoop && !!token,
    staleTime: 60_000,
  })

  // Passive read of the matches cache — subscribes (so the bar re-renders when
  // /market populates it) but `enabled:false` guarantees the bar never triggers a
  // matches fetch itself. Source for the "next" fit + the "N new" Capture signal.
  const { data: matches } = useQuery<JobMatchesResponse>({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobsApi.matches(token),
    enabled: false,
  })

  const model = React.useMemo<LoopBarModel | null>(() => {
    const apps = appsQ.data ?? []
    if (apps.length === 0) return null
    const counts = chipCounts(apps)
    const collected = apps.filter((a) => !isApplied(a)).length
    const tailored = apps.filter((a) => a.cv_badge && !isApplied(a)).length

    // "Next" = the highest-fit saved job that still needs tailoring. Fit is joined
    // from cached matches only (never faked); absent → the row still points there.
    const byId = matchesById(matches?.jobs)
    const toTailor = apps
      .filter((a) => !isApplied(a) && !a.cv_badge)
      .map((a) => ({ a, fit: byId.get(a.job_id)?.match_score ?? null }))
      .sort((x, y) => (y.fit ?? -1) - (x.fit ?? -1))[0]
    const next = toTailor
      ? {
          label: `Tailor ${toTailor.a.company ?? toTailor.a.title}${toTailor.fit ? ` · ${toTailor.fit}%` : ""}`,
          href: `/cv?jobId=${encodeURIComponent(toTailor.a.job_id)}`,
        }
      : undefined

    // "N new" on Capture — new live jobs since the user's last match. On /market
    // the refresh gate is mounted, so one tap opens it; elsewhere it deep-links to
    // /market where the refresh lives. The Tailor magnet is never displaced.
    const newJobs = matches?.new_jobs_count ?? 0
    const captureAlert =
      newJobs > 0
        ? {
            label: `${newJobs} new`,
            ...(onMarket ? { onClick: openRefreshGate } : { href: "/market" }),
          }
        : undefined

    return {
      steps: [
        { label: "Capture", value: `${counts.all}`, href: "/market", alert: captureAlert },
        { label: "Collect", value: `${collected}`, href: "/collections" },
        { label: "Tailor", value: `${tailored}/${collected}`, href: "/collections" },
        { label: "Apply", value: `${counts.applied} sent`, href: "/collections" },
      ],
      activeIndex: activeStep(pathname),
      next,
    }
  }, [appsQ.data, matches, pathname, onMarket])

  if (!onLoop || !model) return null
  return <LoopBar {...model} />
}
