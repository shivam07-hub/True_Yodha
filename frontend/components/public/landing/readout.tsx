"use client"

/* CV Hub section (grill). Two states:
   - sample (default): the teaser readout, shown before any CV is dropped.
   - live: the REAL Myro Score + domain split returned from /public/score-cv
     after a logged-out user drops their CV — PLUS their own CV reformatted to
     the Myro standard (the "Your CV" tab). Everything actionable below the
     score, and the CV download, is gated behind signup. */

import { useEffect, useRef, useState } from "react"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import type { AnonScoreResponse } from "@/lib/api"
import { PdfPage, type PdfPageContact } from "@/components/cv/builder/pdf-page"

import "@/app/(authed)/cv/cv-fonts.css"
import "@/app/(authed)/cv/cv-sheet.css"

const SAMPLE_GAPS = [
  { skill: "Product Strategy", tag: "Very high demand", hot: true, note: "· Not on CV" },
  { skill: "Go-to-Market Strategy", tag: "High demand", hot: false, note: "· Early stage" },
  { skill: "User Research & Discovery", tag: "Very high demand", hot: true, note: "· Early stage" },
]

const SAMPLE_STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

const NO_HIDDEN: Set<string> = new Set()

/** Scales the fixed 816px Myro CV sheet down to fit the card width. The sheet
 *  is a real document render, not a mock — what a signed-up user downloads. */
function ScaledSheet({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.62)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setScale(Math.min(1, el.clientWidth / 816))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={frameRef} className="lp-cv-frame" style={{ height: 1056 * scale }}>
      <div className="lp-cv-scale" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

export function LandingReadout({ result }: { result?: AnonScoreResponse | null }) {
  const signup = useSignupGate()
  const live = !!result
  const hasCv = !!result?.cv
  const [tab, setTab] = useState<"score" | "cv">("score")

  const score = result?.score ?? 62
  const verdict = result?.verdict ?? "Strong enough to apply, with a few high-value gaps still holding the profile back."

  const contact: PdfPageContact = {
    name: result?.contact?.name?.trim() || "Your name",
    title: result?.contact?.title ?? "",
    location: result?.contact?.location ?? "",
    email: result?.contact?.email ?? "",
    phone: result?.contact?.phone ?? "",
    linkedin: result?.contact?.linkedin ?? "",
  }

  return (
    <section className="lp-readout" id="cv-hub" aria-label={live ? "Your readout" : "Sample readout"}>
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">{live ? "Your readout" : "Sample readout"}</span>
          <h2 className="lp-section-title">
            {live ? "What the Engine says about your CV." : "What the Engine says about one CV version."}
          </h2>
        </div>

        {hasCv && (
          <div className="lp-readout-tabs lp-reveal" role="tablist" aria-label="Readout view">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "score"}
              className={`lp-readout-tab${tab === "score" ? " is-active" : ""}`}
              onClick={() => setTab("score")}
            >
              Your score
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "cv"}
              className={`lp-readout-tab${tab === "cv" ? " is-active" : ""}`}
              onClick={() => setTab("cv")}
            >
              Your CV · Myro standard
            </button>
          </div>
        )}

        {tab === "score" || !hasCv ? (
          <div className="lp-readout-card lp-reveal">
            <div className="lp-readout-head">
              <div>
                <div className="lp-readout-version">
                  {live ? `Your CV · ${result!.skills_detected} skills read` : "Content intern version"}
                </div>
                <div className="lp-readout-score">
                  <span className="lp-readout-score-num">{score}</span>
                  <span className="lp-readout-score-denom">/100</span>
                </div>
              </div>
              <p className="lp-readout-verdict">{verdict}</p>
            </div>

            <div className="lp-readout-bar">
              <span style={live ? { width: `${score}%` } : undefined} />
            </div>

            <div className="lp-readout-cols">
              <div className="lp-readout-col">
                <div className="lp-readout-col-title warn">Improve before applying</div>
                <div className="lp-readout-items">
                  {live
                    ? result!.gaps.map((g) => (
                        <div key={g.name}>
                          <div className="lp-readout-skill">{g.name}</div>
                          <div className="lp-readout-tags">
                            <span className="lp-readout-tag hot">{g.score}/100</span>
                            <span className="lp-readout-note-sm">· biggest lift</span>
                          </div>
                        </div>
                      ))
                    : SAMPLE_GAPS.map((g) => (
                        <div key={g.skill}>
                          <div className="lp-readout-skill">{g.skill}</div>
                          <div className="lp-readout-tags">
                            <span className={`lp-readout-tag${g.hot ? " hot" : ""}`}>{g.tag}</span>
                            <span className="lp-readout-note-sm">{g.note}</span>
                          </div>
                        </div>
                      ))}
                </div>
              </div>

              <div className="lp-readout-col">
                <div className="lp-readout-col-title ok">Already strong</div>
                <div className="lp-readout-items">
                  {live
                    ? result!.strengths.map((s) => (
                        <div key={s.name}>
                          <div className="lp-readout-skill">{s.name}</div>
                          <p className="lp-readout-note">Scoring {s.score}/100 against live demand.</p>
                        </div>
                      ))
                    : SAMPLE_STRENGTHS.map((s) => (
                        <div key={s.skill}>
                          <div className="lp-readout-skill">{s.skill}</div>
                          <p className="lp-readout-note">{s.note}</p>
                        </div>
                      ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="lp-readout-card lp-reveal">
            <div className="lp-cv-head">
              <div>
                <div className="lp-readout-version">Your CV · reformatted to the Myro standard</div>
                <p className="lp-cv-sub">
                  The same clean, ATS-safe layout every Myro member uses. Download it as PDF or DOCX
                  after you sign up — free.
                </p>
              </div>
              <button
                type="button"
                className="lp-readout-unlock-cta"
                onClick={() => signup.open({ surface: "manual", next: "/cv?upload=1", source: "landing_readout_download" })}
              >
                Download my CV →
              </button>
            </div>

            <div className="cvb-scope">
              <ScaledSheet>
                <PdfPage cv={result!.cv!} hidden={NO_HIDDEN} contact={contact} />
              </ScaledSheet>
            </div>
          </div>
        )}

        {live && (
          <div className="lp-readout-unlock lp-reveal">
            <p className="lp-readout-unlock-copy">
              That&apos;s your score. Sign up free to unlock the jobs you match, the exact skills to
              practice, a tailored CV for every role, and the download of this Myro-standard CV.
            </p>
            <button
              type="button"
              className="lp-readout-unlock-cta"
              onClick={() => signup.open({ surface: "manual", next: "/cv?upload=1", source: "landing_readout_unlock" })}
            >
              Unlock my matches →
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
