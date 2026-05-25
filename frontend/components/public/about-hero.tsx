"use client"

import Link from "next/link"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import "./about-hero.css"

const UPLOAD_CTA_HREF = `/signup?next=${encodeURIComponent("/cv?upload=1")}`
const NEXT_AFTER_SIGNUP = "/cv?upload=1"

const BRANCHES = [
  { y: 22, label: "baseline", score: "62", delta: null, baseline: true },
  { y: 62, label: "content intern", score: "78", delta: "+16", baseline: false },
  { y: 102, label: "marketing intern", score: "82", delta: "+20", baseline: false },
] as const

const GHOST_Y = 142

export function AboutHero() {
  const signup = useSignupGate()
  return (
    <section className="tm-about-hero">
      <div className="tm-about-hero-inner">

        {/* ── Status chip ──────────────────────────────────── */}
        <div className="tm-about-chip" aria-label="Example CV hub follows">
          <span className="tm-about-chip-tag">example</span>
          <span className="tm-about-chip-sep">·</span>
          <span>1 master CV</span>
          <span className="tm-about-chip-sep">·</span>
          <span>2 job versions</span>
        </div>

        {/* ── Headline ─────────────────────────────────────── */}
        <h1 className="tm-about-headline">
          <span className="tm-about-headline-line">One hub for </span>
          <span className="tm-about-headline-line">every CV version.</span>
        </h1>

        <p className="tm-about-subhead">
          Save your master CV. Tailor one for each internship or job.
          Know which resume to send.
        </p>

        {/* ── Commit graph ─────────────────────────────────── */}
        <div className="tm-about-graph">
          <svg
            className="tm-about-graph-svg"
            viewBox="0 0 360 180"
            role="img"
            aria-labelledby="about-graph-title about-graph-desc"
          >
            <title id="about-graph-title">
              Example commit graph showing one baseline CV with two tailored versions and a waiting slot for the next.
            </title>
            <desc id="about-graph-desc">
              Baseline scores 62. The Content Intern tailored version scores 78, up 16 from baseline.
              The Marketing Intern tailored version scores 82, up 20. A dashed ghost branch represents
              the next tailored CV the visitor can create.
            </desc>

            {/* Trunk */}
            <path className="tm-about-graph-rail" d="M14,22 L14,142" />

            {/* Branch lines (solid for real branches) */}
            <path className="tm-about-graph-branch" d="M14,62 L26,62" />
            <path className="tm-about-graph-branch" d="M14,102 L26,102" />

            {/* Ghost branch line (dashed, pulsing) */}
            <path className="tm-about-graph-ghost-line" d="M14,142 L26,142" />

            {/* Baseline dot (muted) */}
            <circle className="tm-about-graph-dot-baseline" cx="14" cy="22" r="5" />

            {/* Real tailored dots */}
            <circle className="tm-about-graph-dot" cx="26" cy="62" r="5" />
            <circle className="tm-about-graph-dot" cx="26" cy="102" r="5" />

            {/* Ghost dot (dashed outline) */}
            <circle className="tm-about-graph-ghost-dot" cx="26" cy="142" r="5" />

            {/* Labels */}
            {BRANCHES.map((b) => (
              <text
                key={b.label}
                className={
                  b.baseline
                    ? "tm-about-graph-label tm-about-graph-label-baseline"
                    : "tm-about-graph-label"
                }
                x={40}
                y={b.y}
                dominantBaseline="central"
              >
                {b.label}
              </text>
            ))}
            <text
              className="tm-about-graph-label tm-about-graph-label-ghost"
              x={40}
              y={GHOST_Y}
              dominantBaseline="central"
            >
              your next tailored CV
            </text>

            {/* Scores (right-aligned) */}
            {BRANCHES.map((b) => (
              <text
                key={`score-${b.label}`}
                className="tm-about-graph-score"
                x={290}
                y={b.y}
                dominantBaseline="central"
                textAnchor="end"
              >
                {b.score}
              </text>
            ))}

            {/* Deltas (further right) */}
            {BRANCHES.filter((b) => b.delta).map((b) => (
              <text
                key={`delta-${b.label}`}
                className="tm-about-graph-delta"
                x={348}
                y={b.y}
                dominantBaseline="central"
                textAnchor="end"
              >
                {b.delta}
              </text>
            ))}
          </svg>
        </div>

        {/* ── Primary CTA — opens SignupModal, falls back to /signup ── */}
        <Link
          href={UPLOAD_CTA_HREF}
          className="tm-about-cta-primary"
          onClick={(e) => {
            // Hijack only when JS is live + modal is mountable.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
            e.preventDefault()
            signup.open({ surface: "about_hero", next: NEXT_AFTER_SIGNUP })
          }}
        >
          Start your CV hub
          <span aria-hidden>→</span>
        </Link>

        {/* ── Secondary anchor ─────────────────────────────── */}
        <a href="#sample-diagnostic" className="tm-about-cta-secondary">
          See how versions get scored
          <span className="tm-about-cta-secondary-arrow" aria-hidden>↓</span>
        </a>

        {/* ── Trust hook ───────────────────────────────────── */}
        <p className="tm-about-trust">Private by default.</p>

      </div>
    </section>
  )
}
