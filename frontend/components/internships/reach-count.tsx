"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"

export interface ReachInput {
  city: string
  remote: boolean
  skills: string[]
}

/**
 * The recruiter's first result: how many people already on Myro this post
 * reaches, while she writes it. Two numbers, because everyone who matches is
 * not everyone who will see it — the second is who was here this month.
 */
export function ReachCount({ input }: { input: ReachInput }) {
  const settled = useDebouncedValue(input, 400)
  const asked = settled.remote || settled.city.trim().length > 0
  const { data } = useQuery({
    queryKey: ["internship-reach", settled.city.trim().toLowerCase(), settled.remote, settled.skills.map((s) => s.toLowerCase())],
    queryFn: () => jobs.internshipReach(settled),
    enabled: asked,
    staleTime: 5 * 60_000,
  })
  if (!asked || !data) return null
  return (
    <p className="intern-reach" aria-live="polite">
      {data.matched === 0 ? (
        "No one on Myro matches yet"
      ) : (
        <>
          <strong>{data.matched}</strong> {data.matched === 1 ? "person" : "people"} on Myro match
          {" · "}
          <strong>{data.active_30d}</strong> here this month
        </>
      )}
    </p>
  )
}
