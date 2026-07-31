"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type JobMatchesResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { deriveNextAction } from "@/components/nav/next-action"

/**
 * The global Next chip (unified-structure S2, lock #4) — the one persistent
 * "what do I do now" in the topbar, on every authed desktop surface. Reads the
 * same shared caches as the journey counts: applications (cheap fetch, shared
 * key) carry durable saved-role fit scores; a passive matches read supplements
 * fresh-match volume once /market has populated the cache.
 *
 * A generic pointer ("Find a role to tailor") hides on its own surface —
 * pointing at the page you're on is noise, not orientation.
 */

/** Segment-boundary match — "/cv" must not claim "/cv-preview". */
function onSurface(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function NextChip({ hasCv }: { hasCv: boolean }) {
  const { token } = useAuth()
  const pathname = usePathname()

  const { data: apps } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const { data: matches } = useQuery<JobMatchesResponse>({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobsApi.matches(token!),
    enabled: false, // passive — never triggers a fetch itself
  })

  if (!apps && hasCv) return null // cache warming — no flash of a wrong answer
  const next = deriveNextAction(apps ?? [], matches?.jobs, {
    hasCv,
    newJobs: matches?.new_jobs_count ?? 0,
  })
  if (next.generic && onSurface(pathname, next.href)) return null

  return (
    <Link href={next.href} className="tm-next-chip" title="Your single best next move">
      <span className="tm-next-chip-key" aria-hidden>next</span>
      <span className="tm-next-chip-label">{next.label}</span>
      <span className="tm-next-chip-arrow" aria-hidden>→</span>
    </Link>
  )
}
