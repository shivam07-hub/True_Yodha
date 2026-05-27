"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { SampleDiagnostic } from "@/components/public/sample-diagnostic"
import { PublicFooter } from "@/components/public/public-footer"
import { useOnboardingHandoff } from "@/store/onboardingHandoff"
import "./landing-page.css"

const BRANCHES = [
  { y: 22,  label: "baseline",         score: "62", delta: null,  baseline: true  },
  { y: 62,  label: "content intern",   score: "78", delta: "+16", baseline: false },
  { y: 102, label: "marketing intern", score: "82", delta: "+20", baseline: false },
] as const

const GHOST_Y = 142

const TIMELINE = [
  { t: "0:00",  title: "Drop in",      desc: "PDF or DOCX. Encrypted at rest. Parsed in ~7s." },
  { t: "1:30",  title: "We read it",   desc: "Skill graph seeded. 200+ signals lifted."        },
  { t: "3:00",  title: "Pick a target",desc: "Live job feed or paste a JD link."              },
  { t: "5:00",  title: "See gaps",     desc: "Match %, missing skills, weak bullets."          },
  { t: "7:30",  title: "Tailor",       desc: "AI rewrites bullets for the role. One click."   },
  { t: "10:00", title: "Download",     desc: "PDF + shareable link. Apply. Loop closes."      },
]

export function LandingPage() {
  const router     = useRouter()
  const setCVFile  = useOnboardingHandoff((s) => s.setCVFile)
  const fileRef    = useRef<HTMLInputElement>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCVFile(file)
    router.push("/onboarding")
  }

  return (
    <div className="tm-landing">
      <PublicTopNav active="about" showSignIn />

      <div className="tm-landing-scroll">

        {/* ── HERO ────────────────────────────────────────────── */}
        <section className="tm-landing-hero">
          <div className="tm-landing-hero-left">

            <div className="tm-landing-chip" aria-label="At a glance">
              <span className="tm-landing-chip-tag">10 minutes</span>
              <span className="tm-landing-chip-sep">·</span>
              <span>any role</span>
              <span className="tm-landing-chip-sep">·</span>
              <span>scored</span>
            </div>

            <h1 className="tm-landing-h1">
              A job-ready CV<br />in 10 minutes.
            </h1>

            <p className="tm-landing-subhead">
              One master CV, tailored for each job role.
            </p>

            <button
              type="button"
              className="tm-landing-dropzone"
              onClick={() => fileRef.current?.click()}
            >
              <div className="tm-landing-dropzone-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v14M6 9l6-6 6 6M5 21h14" />
                </svg>
              </div>
              <div className="tm-landing-dropzone-body">
                <span className="tm-landing-dropzone-title">Drop your CV — PDF or DOCX</span>
                <span className="tm-landing-dropzone-trust">
                  Private by default · encrypted at rest · parsed in ~7s
                </span>
              </div>
              <span className="tm-landing-dropzone-btn" aria-hidden>
                Choose file
              </span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFile}
              aria-label="Upload your CV"
              style={{ display: "none" }}
            />

            <a href="#sample-diagnostic" className="tm-landing-cta-secondary">
              See how versions get scored
              <span className="tm-landing-cta-arrow" aria-hidden>↓</span>
            </a>

          </div>

          {/* ── Commit graph ──────────────────────────────────── */}
          <div className="tm-landing-hero-right" aria-hidden>
            <div className="tm-landing-graph-wrap">
              <svg
                className="tm-landing-graph"
                viewBox="0 0 360 180"
                role="img"
                aria-labelledby="lg-title lg-desc"
              >
                <title id="lg-title">
                  Example CV hub: one baseline with two tailored versions.
                </title>
                <desc id="lg-desc">
                  Baseline scores 62. Content intern tailored version scores 78, up 16.
                  Marketing intern scores 82, up 20. Ghost branch shows the next slot.
                </desc>

                {/* Trunk */}
                <path className="tm-lg-rail" d="M14,22 L14,142" />

                {/* Branch lines */}
                <path className="tm-lg-branch" d="M14,62 L26,62" />
                <path className="tm-lg-branch" d="M14,102 L26,102" />

                {/* Ghost branch */}
                <path className="tm-lg-ghost-line" d="M14,142 L26,142" />

                {/* Dots */}
                <circle className="tm-lg-dot-baseline" cx="14" cy="22"  r="5" />
                <circle className="tm-lg-dot"          cx="26" cy="62"  r="5" />
                <circle className="tm-lg-dot"          cx="26" cy="102" r="5" />
                <circle className="tm-lg-ghost-dot"    cx="26" cy="142" r="5" />

                {/* Labels */}
                {BRANCHES.map((b) => (
                  <text
                    key={b.label}
                    className={b.baseline ? "tm-lg-label tm-lg-label-baseline" : "tm-lg-label"}
                    x={40} y={b.y} dominantBaseline="central"
                  >
                    {b.label}
                  </text>
                ))}
                <text className="tm-lg-label tm-lg-label-ghost" x={40} y={GHOST_Y} dominantBaseline="central">
                  your next tailored CV
                </text>

                {/* Scores */}
                {BRANCHES.map((b) => (
                  <text key={`s-${b.label}`} className="tm-lg-score"
                    x={290} y={b.y} dominantBaseline="central" textAnchor="end">
                    {b.score}
                  </text>
                ))}

                {/* Deltas */}
                {BRANCHES.filter((b) => b.delta).map((b) => (
                  <text key={`d-${b.label}`} className="tm-lg-delta"
                    x={348} y={b.y} dominantBaseline="central" textAnchor="end">
                    {b.delta}
                  </text>
                ))}
              </svg>
            </div>
          </div>
        </section>

        {/* ── TIMELINE ────────────────────────────────────────── */}
        <section className="tm-landing-timeline-section" aria-label="How Myro works">
          <div className="tm-landing-tl-eyebrow">The 0 → 10 minute loop</div>
          <div className="tm-landing-timeline">
            <div className="tm-landing-tl-rail">
              <div className="tm-landing-tl-fill" />
            </div>
            {TIMELINE.map((step, i) => (
              <div
                key={step.t}
                className={
                  "tm-landing-tl-step" +
                  (i < 2 ? " done" : i === 2 ? " active" : "")
                }
              >
                <div className="tm-landing-tl-node">
                  <span className="tm-landing-tl-num">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="tm-landing-tl-time">{step.t}</div>
                <div className="tm-landing-tl-title">{step.title}</div>
                <div className="tm-landing-tl-desc">{step.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SAMPLE DIAGNOSTIC ───────────────────────────────── */}
        <div id="sample-diagnostic" style={{ scrollMarginTop: 72 }}>
          <SampleDiagnostic />
        </div>

        <PublicFooter />
      </div>
    </div>
  )
}
