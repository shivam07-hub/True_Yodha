/**
 * /cv/reservoir — Experience Reservoir inventory (v2).
 *
 * Fetches the live inventory from GET /cv/reservoir (roles → points → phrasing
 * variants). Falls back to RESERVOIR_FIXTURE while loading / unauthenticated so the
 * route always renders something to look at. The `key` flips fixture→live so the
 * view re-seeds its local curation state when real data arrives.
 *
 * Inventory-side curation (promote/delete) is local-state for now; the reservoir is
 * populated by the gap-accept dual-write, and a PATCH /cv/reservoir for in-place
 * curation is a later phase. Spec: project_cv_experience_reservoir.md.
 */
"use client"

import { useQuery } from "@tanstack/react-query"
import { cv as cvApi } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { ReservoirView } from "@/components/cv/builder/reservoir-view"
import { RESERVOIR_FIXTURE } from "@/components/cv/builder/reservoir-fixture"
import "../cv-fonts.css"
import "../cv-builder.css"

export default function ReservoirPage() {
  const { token, ready } = useAuth()
  const query = useQuery({
    queryKey: ["cv", "reservoir"],
    queryFn: () => cvApi.reservoir(token!),
    enabled: !!ready && !!token,
  })

  const data = query.data ?? RESERVOIR_FIXTURE
  return (
    <div className="cvb-scope">
      <ReservoirView key={query.data ? "live" : "fixture"} data={data} />
    </div>
  )
}
