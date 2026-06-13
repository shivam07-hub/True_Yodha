"use client"

/* CV Hub section (grill). Two states:
   - sample (default): the teaser readout, shown before any CV is dropped.
   - live: the REAL Myro Score + domain split returned from /public/score-cv
     after a logged-out user drops their CV. Same card shape, real data.
   Everything actionable below the score is gated behind signup. */

import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import type { AnonScoreResponse } from "@/lib/api"

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

export function LandingReadout({ result }: { result?: AnonScoreResponse | null }) {
  const signup = useSignupGate()
  const live = !!result

  const score = result?.score ?? 62
  const verdict = result?.verdict ?? "Strong enough to apply, with a few high-value gaps still holding the profile back."

  return (
    <section className="lp-readout" id="cv-hub" aria-label={live ? "Your readout" : "Sample readout"}>
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">{live ? "Your readout" : "Sample readout"}</span>
          <h2 className="lp-section-title">
            {live ? "What the Engine says about your CV." : "What the Engine says about one CV version."}
          </h2>
        </div>

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

        {live && (
          <div className="lp-readout-unlock lp-reveal">
            <p className="lp-readout-unlock-copy">
              That&apos;s your score. Sign up free to unlock the jobs you match, the exact skills to
              practice, and a tailored CV for every role.
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
