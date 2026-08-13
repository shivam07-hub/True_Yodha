"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"
import { openRefreshGate } from "@/store/refreshGateStore"
import "./new-inventory-strip.css"

/**
 * "N new roles landed since your last search" — the visible half of the pull
 * model: Myro ingests continuously, the user is told, the user runs the search.
 *
 * ONE component for both skins (desktop /market workspace + the mobile Jobs
 * surface). The two used to be able to disagree about whether the user was told
 * anything at all — mobile simply never rendered the signal.
 *
 * Persistent while it's true, not a once-a-day toast: Myro holding roles this
 * user has never searched is a standing fact about their feed. It disappears the
 * moment they run the search (the run stamps `last_match_run_at`, the count goes
 * to 0). Reads the shared matches cache — no request of its own.
 */
export function NewInventoryStrip({ token }: { token: string | null }) {
  const { data } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
  })

  const count = data?.new_jobs_count ?? 0
  if (count <= 0) return null

  return (
    <button type="button" className="tm-newinv-strip" onClick={() => openRefreshGate()}>
      <span className="tm-newinv-count">{formatCount(count)}</span>
      <span className="tm-newinv-copy">
        new role{count === 1 ? "" : "s"} landed since your last search
      </span>
      <span className="tm-newinv-cta">Run Myro Search · Free →</span>
    </button>
  )
}
