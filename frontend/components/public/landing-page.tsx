"use client"

import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { SampleDiagnostic } from "@/components/public/sample-diagnostic"
import { PublicFooter } from "@/components/public/public-footer"
import "./landing-page.css"

export function LandingPage() {
  const router = useRouter()

  function goSignup() {
    router.push("/signup?next=/cv?upload=1")
  }

  return (
    <div className="tm-landing">
      <PublicTopNav active="about" showSignIn />

      <div className="tm-landing-scroll">

        {/* ── HERO ────────────────────────────────────────────── */}
        <section className="tm-landing-hero">
          <div className="tm-landing-hero-left">

            <h1 className="tm-landing-h1">
              A job-ready CV<br />in 10 minutes.
            </h1>

            <p className="tm-landing-subhead">
              <span className="tm-landing-chip-tag">10 minutes</span>
              <span className="tm-landing-chip-sep">·</span>
              <span>Any Job</span>
              <span className="tm-landing-chip-sep">·</span>
              <span>Scored</span>
              <span className="tm-landing-chip-sep">·</span>
              <span className="tm-landing-chip-tag">Tailored</span>
            </p>

            <button
              type="button"
              className="tm-landing-dropzone"
              onClick={goSignup}
              aria-label="Drop your CV to get started — sign up required"
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
                  Private · encrypted · ~7s parse
                </span>
              </div>
              <span className="tm-landing-dropzone-btn" aria-hidden>
                Choose file
              </span>
            </button>

          </div>

          {/* ── CV placeholder mock ───────────────────────────── */}
          <div className="tm-landing-hero-right">

            {/* skill detected toast — anchored top of CV mock */}
            <span className="tm-landing-skill-toast" role="status" aria-live="polite">
              <span className="tm-landing-skill-plus" aria-hidden>+</span>
              <span>skill detected:&nbsp;</span>
              <span className="tm-landing-skill-val">Stakeholder Mgmt L4</span>
            </span>

            {/* private-by-default wax stamp — overlaid on the CV */}
            <span className="tm-landing-private-stamp" aria-label="Private by default">
              private<br />by default
            </span>

            <article className="tm-landing-cv-mock" aria-label="Example CV preview">
              <h3 className="tm-landing-cv-name">Your Name</h3>
              <p className="tm-landing-cv-contact">Title&nbsp;·&nbsp;contact</p>

              <section className="tm-landing-cv-section">
                <p className="tm-landing-cv-heading">Profile</p>
                <span className="tm-landing-cv-line long" />
                <span className="tm-landing-cv-line medium" />
              </section>

              <section className="tm-landing-cv-section">
                <p className="tm-landing-cv-heading">Experience</p>
                <span className="tm-landing-cv-line highlight" />
                <span className="tm-landing-cv-line medium" />
                <span className="tm-landing-cv-line long" />
                <span className="tm-landing-cv-line short" />
              </section>

              <section className="tm-landing-cv-section">
                <p className="tm-landing-cv-heading">Skills</p>
                <span className="tm-landing-cv-line medium" />
                <span className="tm-landing-cv-line short" />
              </section>

              <section className="tm-landing-cv-section">
                <p className="tm-landing-cv-heading">Education</p>
                <span className="tm-landing-cv-line long" />
              </section>
            </article>

            {/* floating Myro Score badge — anchored bottom-right */}
            <div className="tm-landing-score-badge" aria-label="Live Myro Score example">
              <span className="tm-landing-score-lbl">Myro Score:</span>
              <span className="tm-landing-score-num">82</span>
              <span className="tm-landing-score-denom">/100</span>
            </div>
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
