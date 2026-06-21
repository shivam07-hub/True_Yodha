"use client"

import * as React from "react"
import { CompanyDrawer } from "@/components/companies/company-drawer"
import { CompanyLink } from "@/components/companies/company-link"
import { Deepeners } from "./deepeners"
import type { JobMatch } from "@/lib/api"

export interface OtherRole {
  jobId: string
  role: string
  fit: number | null
}

export function LensCompany({
  job,
  token,
  active,
  otherRoles,
  onJump,
}: {
  job: JobMatch
  token: string
  active: boolean
  otherRoles: OtherRole[]
  onJump?: (jobId: string) => void
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const company = job.company

  return (
    <div className="db-lens db-lens--company">
      <div className="db-co-head">
        <CompanyLink company={company} className="db-co-name" />
        {company ? (
          <button type="button" className="db-mini-btn" onClick={() => setDrawerOpen(true)}>
            Reviews + funnel →
          </button>
        ) : null}
      </div>

      {otherRoles.length > 0 ? (
        <div className="db-co-roles">
          <div className="db-lens-h">Other open roles here <span className="db-count">{otherRoles.length}</span></div>
          {otherRoles.slice(0, 4).map((r) => (
            <button
              key={r.jobId}
              type="button"
              className="db-co-role-row"
              onClick={() => onJump?.(r.jobId)}
            >
              <span className="role">{r.role}</span>
              {r.fit != null ? <span className="fit">{r.fit}%</span> : <span className="fit">★</span>}
            </button>
          ))}
        </div>
      ) : null}

      <Deepeners jobId={job.job_id} token={token} active={active} />

      {company ? (
        <CompanyDrawer company={company} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      ) : null}
    </div>
  )
}
