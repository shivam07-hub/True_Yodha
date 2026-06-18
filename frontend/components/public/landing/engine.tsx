"use client"

import { Globe, Sparkles, Network, Target, FileText, type LucideIcon } from "lucide-react"
import { LandingDropzone } from "@/components/public/landing/dropzone"
import { SectionTitle } from "@/components/public/landing/section-title"
import type { AnonScoreResponse } from "@/lib/api"

interface Stage {
  num: string
  title: string
  meta: string
  Icon: LucideIcon
}

function StageCard({ stage, className }: { stage: Stage; className?: string }) {
  const { Icon } = stage
  return (
    <div className={`lp-stage${className ? ` ${className}` : ""}`}>
      <div className="lp-stage-top">
        <span className="lp-stage-icon" aria-hidden>
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <span className="lp-stage-num">STAGE {stage.num}</span>
      </div>
      <div className="lp-stage-title">{stage.title}</div>
      <p className="lp-stage-meta">{stage.meta}</p>
    </div>
  )
}

interface LandingEngineProps {
  companiesLabel: string
  scoring: boolean
  scoreError: string | null
  onScoring: () => void
  onResult: (result: AnonScoreResponse, file: File) => void
  onError: (message: string) => void
}

export function LandingEngine({
  companiesLabel,
  scoring,
  scoreError,
  onScoring,
  onResult,
  onError,
}: LandingEngineProps) {
  const stages: Stage[] = [
    {
      num: "01",
      title: "Career pages, read live",
      meta: `${companiesLabel} MNC career portals, tracked continuously`,
      Icon: Globe,
    },
    {
      num: "02",
      title: "AI enrichment",
      meta: "Every posting cleaned, summarized, skill-tagged",
      Icon: Sparkles,
    },
    {
      num: "03",
      title: "Skill taxonomy",
      meta: "32,000+ skills · levels L1–L5",
      Icon: Network,
    },
    {
      num: "05",
      title: "Match · Score · Tailor",
      meta: "Best-fit roles ranked · one CV version per job",
      Icon: Target,
    },
  ]

  return (
    <section className="lp-engine" id="engine" aria-label="The Myro Engine">
      <div className="lp-grid-bg" aria-hidden />

      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle priority>One pipeline runs everything on Myro.</SectionTitle>
          <p className="lp-section-sub">
            The Myro Engine reads the market continuously. Every product on this page is a
            different window into the same machine.
          </p>
        </div>

        <div className="lp-pipeline lp-reveal">
          <div className="lp-flow-h f1" aria-hidden />
          <div className="lp-flow-h f2" aria-hidden />
          <div className="lp-flow-h f3" aria-hidden />
          {stages.map((stage) => (
            <StageCard key={stage.num} stage={stage} />
          ))}
        </div>

        <div className="lp-pipeline-merge lp-reveal">
          <div className="lp-flow-v" aria-hidden />
          <p className="lp-merge-note">
            <strong>Your CV joins the stream.</strong> The Engine isn&rsquo;t just market data —
            it&rsquo;s market data meeting your CV. Drop it to see your score against everything
            above.
          </p>
          <div className="lp-stage lp-stage-cv lp-stage-cv-live">
            <div className="lp-stage-top">
              <span className="lp-stage-icon" aria-hidden>
                <FileText size={20} strokeWidth={1.5} />
              </span>
              <span className="lp-stage-num">STAGE 04</span>
            </div>
            <div className="lp-stage-title">Your CV</div>
            <LandingDropzone
              source="engine-stage04"
              busy={scoring}
              onScoring={onScoring}
              onResult={onResult}
              onError={onError}
            />
            {scoreError ? <p className="lp-dropzone-error">{scoreError}</p> : null}
          </div>
        </div>

        <p className="lp-roadmap-line lp-reveal">
          In development: referral paths into the companies you target.
        </p>
      </div>
    </section>
  )
}
