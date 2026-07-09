"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type JobMatchesResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { chipCounts, isApplied, matchesById } from "@/lib/collections/model"
import { LoopBar, type LoopBarModel } from "./loop-bar"

/**
 * Mounts the Loop Bar (journey B) globally under the desktop topbar, but only on
 * the surfaces where the job-search loop is the active task (Jobs / Collections /
 * Tailor / Applications) — showing it on Skills, Forge or Newsletter would be
 * chrome noise, not orientation.
 *
 * Data is deliberately cheap: it fetches `applications` (small, and shares the
 * Collections cache via dataKeys.applications) and only READS cached matches for
 * the fit % on the "next" magnet — it never triggers a matches fetch from the
 * shell.
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
  const qc = useQueryClient()
  const onLoop = LOOP_ROUTES.some((r) => pathname.startsWith(r))

  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: onLoop && !!token,
    staleTime: 60_000,
  })

  const model = React.useMemo<LoopBarModel | null>(() => {
    const apps = appsQ.data ?? []
    if (apps.length === 0) return null
    const counts = chipCounts(apps)
    const collected = apps.filter((a) => !isApplied(a)).length
    const tailored = apps.filter((a) => a.cv_badge && !isApplied(a)).length

    // "Next" = the highest-fit saved job that still needs tailoring. Fit is joined
    // from cached matches only (never faked); absent → the row still points there.
    const cached = qc.getQueryData<JobMatchesResponse>(dataKeys.jobs())
    const byId = matchesById(cached?.jobs)
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

    return {
      steps: [
        { label: "Capture", value: `${counts.all}`, href: "/market" },
        { label: "Collect", value: `${collected}`, href: "/collections" },
        { label: "Tailor", value: `${tailored}/${collected}`, href: "/collections" },
        { label: "Apply", value: `${counts.applied} sent`, href: "/collections" },
      ],
      activeIndex: activeStep(pathname),
      next,
    }
  }, [appsQ.data, pathname, qc])

  if (!onLoop || !model) return null
  return <LoopBar {...model} />
}
