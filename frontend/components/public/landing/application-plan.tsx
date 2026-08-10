"use client"

import { BookOpenCheck, BriefcaseBusiness, FileCheck2, FolderKanban } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"

export function LandingApplicationPlan() {
  return (
    <section className="lp-plan-story" aria-label="Prepare after applying">
      <div className="lp-wrap lp-plan-layout">
        <div className="lp-section-head">
          <SectionTitle>Applied. Now prepare for this role.</SectionTitle>
          <p className="lp-section-sub">
            Myro keeps the application, missing evidence, and preparation in one job-specific plan.
          </p>
        </div>

        <div className="lp-plan-frame">
          <div className="lp-plan-job">
            <span className="lp-plan-job-icon" aria-hidden="true">
              <BriefcaseBusiness className="size-5" />
            </span>
            <span>
              <small>Application status</small>
              <strong>Applied</strong>
            </span>
            <span className="lp-applied-pill">CV sent</span>
          </div>

          <div className="lp-plan-list" aria-label="Application Plan preview">
            <div className="lp-plan-row">
              <FileCheck2 className="size-5" aria-hidden="true" />
              <span><strong>Strengthen CV evidence</strong><small>Add proof only when it is real</small></span>
              <span className="lp-plan-status">Review</span>
            </div>
            <div className="lp-plan-row">
              <FolderKanban className="size-5" aria-hidden="true" />
              <span><strong>Build the missing skill</strong><small>Start with a project at your level</small></span>
              <span className="lp-plan-status">Practice</span>
            </div>
            <div className="lp-plan-row">
              <BookOpenCheck className="size-5" aria-hidden="true" />
              <span><strong>Prepare for the interview</strong><small>Practice for this role and company</small></span>
              <span className="lp-plan-status">Prepare</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
