"use client"

import { ArrowRight, Check, FileText, Hammer, SearchCheck } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"

export function LandingHowItWorks() {
  return (
    <section className="lp-match-story" id="how-it-works" aria-label="Match and tailor your CV">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>Tailor for the job that matters now.</SectionTitle>
          <p className="lp-section-sub">
            Myro separates proven experience from missing proof, so tailoring never invents a claim.
            Skill gaps stay visible without blocking your application.
          </p>
        </div>

        <div className="lp-match-frame">
          <article className="lp-opening-card">
            <div className="lp-card-eyebrow">Current opening · India</div>
            <div className="lp-opening-source">
              <span className="lp-source-mark" aria-hidden="true">M</span>
              <span>
                <strong>Your chosen role</strong>
                <small>From an MNC career page</small>
              </span>
            </div>
            <div className="lp-requirement-list" aria-label="Job requirements">
              <span>Requirements pulled from the job</span>
              <span>Skills the company is hiring for</span>
            </div>
          </article>

          <div className="lp-match-arrow" aria-hidden="true">
            <ArrowRight className="size-5" />
          </div>

          <article className="lp-fit-card">
            <div className="lp-fit-card-head">
              <span>
                <small>Myro Job Match</small>
                <strong>Your CV against this opening</strong>
              </span>
              <SearchCheck className="size-5" aria-hidden="true" />
            </div>

            <div className="lp-evidence-grid">
              <div className="lp-evidence-row">
                <span className="lp-evidence-icon positive" aria-hidden="true"><Check className="size-4" /></span>
                <span><strong>Already evidenced</strong><small>Use it in the tailored CV</small></span>
              </div>
              <div className="lp-evidence-row">
                <span className="lp-evidence-icon" aria-hidden="true"><FileText className="size-4" /></span>
                <span><strong>Could be surfaced</strong><small>Review a truthful suggested line</small></span>
              </div>
              <div className="lp-evidence-row">
                <span className="lp-evidence-icon" aria-hidden="true"><Hammer className="size-4" /></span>
                <span><strong>Still to build</strong><small>Upskill without blocking the application</small></span>
              </div>
            </div>

            <div className="lp-fit-actions" aria-label="Available next actions">
              <span className="lp-action-primary">Tailor &amp; apply</span>
              <span className="lp-action-secondary">Build skill</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
