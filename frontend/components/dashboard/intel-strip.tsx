"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type MarketAnalytics, type NameCountItem } from "@/lib/api"

interface Signal {
  key: string
  label: string
  value: string
  sub?: string | null
}

function pick(list: NameCountItem[] | undefined): NameCountItem | null {
  return list && list.length > 0 ? list[0] : null
}

function buildSignals(a: MarketAnalytics): Signal[] {
  const out: Signal[] = []
  out.push({ key: "live", label: "Live jobs", value: a.total_jobs.toLocaleString(), sub: "in your market" })
  const co = pick(a.by_company)
  if (co) out.push({ key: "co", label: "Top hiring", value: co.name, sub: `${co.count} open` })
  const role = pick(a.by_role)
  if (role) out.push({ key: "role", label: "Hot role", value: role.name, sub: `${role.count} open` })
  const city = pick(a.by_location_city)
  if (city) out.push({ key: "city", label: "Near you", value: city.name, sub: `${city.count} open` })
  return out.slice(0, 4)
}

/** Market-signal stat strip — intel cards on the dashboard (both surfaces).
 *  Pulls /analytics/me (server already scopes to the user's target market). */
export function IntelStrip({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-me", "dashboard-strip"],
    queryFn: () => jobsApi.analyticsForMe(token),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="db-intel" aria-hidden>
        {[0, 1, 2, 3].map((i) => <div key={i} className="db-intel-card db-intel-skel" />)}
      </div>
    )
  }
  if (!data) return null
  const signals = buildSignals(data)
  if (signals.length === 0) return null

  return (
    <Link href="/intel" className="db-intel" aria-label="Open Live Job Data">
      {signals.map((s) => (
        <div className="db-intel-card" key={s.key}>
          <div className="db-intel-label">{s.label}</div>
          <div className="db-intel-value" title={s.value}>{s.value}</div>
          {s.sub ? <div className="db-intel-sub">{s.sub}</div> : null}
        </div>
      ))}
    </Link>
  )
}
