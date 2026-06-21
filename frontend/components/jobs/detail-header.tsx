"use client"

import * as React from "react"
import { CompanyLink } from "@/components/companies/company-link"

/**
 * The one canonical job-detail header — title → company → location → close.
 * Used by both the shared drawer (live + dashboard) and the dashboard's wide
 * peek panel, so the open job reads identically on every surface. Location is a
 * slot (each surface owns its own LocationLine over its own job shape).
 */
export function DetailHeader({
  title,
  company,
  location,
  onClose,
}: {
  title: string
  company?: string | null
  location?: React.ReactNode
  onClose: () => void
}) {
  return (
    <header className="jdrawer-head">
      <div className="jdrawer-head-main">
        <h2 className="jdrawer-title">{title}</h2>
        {company ? <CompanyLink company={company} className="jdrawer-company" /> : null}
        {location ? <div className="jdrawer-loc">{location}</div> : null}
      </div>
      <button type="button" className="jdrawer-close tm-control-focus" onClick={onClose} aria-label="Close">
        ×
      </button>
    </header>
  )
}
