import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"
import "./b2b-door-page.css"

interface DoorLink {
  href: string
  label: string
  external?: boolean
}

interface DoorMetric {
  label: string
  value: string
}

interface DoorStep {
  title: string
  body: string
}

interface DoorFeature {
  title: string
  body: string
  icon: ReactNode
}

interface DoorRow {
  name: string
  meta: string
  score: string
  summary: string
}

export interface B2BDoorContent {
  strap: string
  headline: ReactNode
  subhead: string
  chips: string[]
  metrics: DoorMetric[]
  boardTitle: string
  boardLabel: string
  boardRows: DoorRow[]
  workflowTitle: string
  workflowBody: string
  workflowBullets: string[]
  primaryCta: DoorLink
  secondaryCta: DoorLink
  steps: DoorStep[]
  features: DoorFeature[]
  mirrorTitle: string
  mirrorBody: string
  mirrorPoints: string[]
  bottomTitle: string
  bottomBody: string
}

function DoorButton({ link, secondary = false }: { link: DoorLink; secondary?: boolean }) {
  const className = secondary ? "tm-b2b-button tm-b2b-button-secondary" : "tm-b2b-button"
  const isMailto = link.href.startsWith("mailto:")

  if (link.external) {
    return (
      <a
        className={className}
        href={link.href}
        target={isMailto ? undefined : "_blank"}
        rel={isMailto ? undefined : "noreferrer"}
      >
        <span>{link.label}</span>
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    )
  }

  return (
    <Link className={className} href={link.href}>
      <span>{link.label}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  )
}

export function B2BDoorPage({ content }: { content: B2BDoorContent }) {
  return (
    <div className="tm-b2b-page">
      <PublicTopNav showSignIn />

      <main className="tm-b2b-main">
        <section className="tm-b2b-hero">
          <div className="tm-b2b-story">
            <span className="tm-b2b-strap">{content.strap}</span>
            <h1 className="tm-b2b-headline">{content.headline}</h1>
            <p className="tm-b2b-subhead">{content.subhead}</p>

            <div className="tm-b2b-chip-row" aria-label="Page themes">
              {content.chips.map((chip) => (
                <span key={chip} className="tm-b2b-chip">
                  {chip}
                </span>
              ))}
            </div>

            <dl className="tm-b2b-metric-strip">
              {content.metrics.map((metric) => (
                <div key={metric.label} className="tm-b2b-metric">
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="tm-b2b-rail">
            <section className="tm-b2b-panel tm-b2b-board" aria-label={content.boardTitle}>
              <div className="tm-b2b-board-head">
                <div>
                  <p className="tm-b2b-panel-label">{content.boardLabel}</p>
                  <h2>{content.boardTitle}</h2>
                </div>
                <span className="tm-b2b-live">
                  <span className="tm-b2b-live-dot" aria-hidden="true" />
                  mirror feed
                </span>
              </div>

              <div className="tm-b2b-board-rows">
                {content.boardRows.map((row) => (
                  <article key={`${row.name}-${row.score}`} className="tm-b2b-row">
                    <div className="tm-b2b-row-top">
                      <div className="tm-b2b-row-copy">
                        <h3>{row.name}</h3>
                        <p>{row.meta}</p>
                      </div>
                      <div className="tm-b2b-row-score">{row.score}</div>
                    </div>
                    <p className="tm-b2b-row-summary">{row.summary}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="tm-b2b-panel tm-b2b-workflow" aria-label={content.workflowTitle}>
              <p className="tm-b2b-panel-label">pilot workflow</p>
              <h2>{content.workflowTitle}</h2>
              <p className="tm-b2b-workflow-body">{content.workflowBody}</p>
              <ul className="tm-b2b-bullets">
                {content.workflowBullets.map((bullet) => (
                  <li key={bullet}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="tm-b2b-actions">
                <DoorButton link={content.primaryCta} />
                <DoorButton link={content.secondaryCta} secondary />
              </div>
            </section>
          </div>
        </section>

        <section className="tm-b2b-section">
          <div className="tm-b2b-section-head">
            <span className="tm-b2b-strap">workflow</span>
            <h2>Built to reduce hiring noise, not decorate it.</h2>
          </div>
          <div className="tm-b2b-step-grid">
            {content.steps.map((step, index) => (
              <article key={step.title} className="tm-b2b-panel tm-b2b-step">
                <span className="tm-b2b-step-index">0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="tm-b2b-section">
          <div className="tm-b2b-section-head">
            <span className="tm-b2b-strap">product layers</span>
            <h2>Useful surfaces we can attach before the full dashboard lands.</h2>
          </div>
          <div className="tm-b2b-feature-grid">
            {content.features.map((feature) => (
              <article key={feature.title} className="tm-b2b-panel tm-b2b-feature">
                <div className="tm-b2b-feature-icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="tm-b2b-section tm-b2b-mirror-block">
          <div className="tm-b2b-section-head">
            <span className="tm-b2b-strap">the mirror</span>
            <h2>{content.mirrorTitle}</h2>
            <p>{content.mirrorBody}</p>
          </div>
          <div className="tm-b2b-panel tm-b2b-mirror-card">
            <ul className="tm-b2b-bullets">
              {content.mirrorPoints.map((point) => (
                <li key={point}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="tm-b2b-bottom">
          <div>
            <span className="tm-b2b-strap">next step</span>
            <h2>{content.bottomTitle}</h2>
            <p>{content.bottomBody}</p>
          </div>
          <div className="tm-b2b-actions">
            <DoorButton link={content.primaryCta} />
            <DoorButton link={content.secondaryCta} secondary />
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
