"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import "./reach.css"

export function ReachDueStrip({ token }: { token: string }) {
  const q = useQuery({
    queryKey: dataKeys.reachTargets("due"),
    queryFn: () => jobsApi.listReachTargets(token, { due: true }),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const n = q.data?.due_count ?? 0
  if (n === 0) {
    return (
      <Link href="/reach" className="rd-due-link">
        <span>Desk</span>
        <span className="rd-due-n">Log people you found</span>
      </Link>
    )
  }
  return (
    <Link href="/reach" className="rd-due-link">
      <span>Desk</span>
      <span className="rd-due-n">{n} follow-up{n === 1 ? "" : "s"} due</span>
    </Link>
  )
}
