"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { newsletter } from "@/lib/api"
import { QUOTES } from "./landing-copy"
import type { IntelTeaserRow } from "./use-landing-data"

function NewsletterStrip({ companiesLabel }: { companiesLabel: string }) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "busy" | "ok" | "error">("idle")

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value || value.indexOf("@") < 1) return
    setStatus("busy")
    try {
      await newsletter.subscribe(value, "landing")
      setStatus("ok")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="lp-news-strip lp-reveal" id="newsletter">
      <p className="lp-news-copy">
        <strong>Myro Intelligence</strong> — what {companiesLabel} companies are hiring for,
        weekly. Written from the Engine&rsquo;s data.
      </p>
      {status === "ok" ? (
        <span className="lp-news-ok" role="status">
          Subscribed — first issue arrives this week.
        </span>
      ) : (
        <form className="lp-news-form" onSubmit={onSubmit}>
          <input
            className="lp-news-input"
            type="email"
            required
            placeholder="you@example.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="lp-news-btn" type="submit" disabled={status === "busy"}>
            {status === "busy" ? "Subscribing…" : "Subscribe"}
          </button>
          {status === "error" && (
            <span className="lp-news-err" role="alert">
              Could not subscribe — try again.
            </span>
          )}
        </form>
      )}
    </div>
  )
}

interface LandingProofProps {
  rows: IntelTeaserRow[]
  asOf: Date | null
  companiesLabel: string
}

export function LandingProof({ rows, asOf, companiesLabel }: LandingProofProps) {
  const asOfLabel = asOf
    ? asOf.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <section className="lp-proof" id="proof" aria-label="Proof — the Engine, live">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">Proof</span>
          <h2 className="lp-section-title">The Engine, live.</h2>
        </div>

        <div className="lp-reveal">
          <div className="lp-intel-card">
            <div className="lp-intel-row head">
              <span>Company</span>
              <span>Open roles</span>
              <span>Top skill in demand</span>
            </div>
            {(rows.length > 0
              ? rows
              : [{ company: "Reading the market…", count: 0, topSkill: null }]
            ).map((row) => (
              <div className="lp-intel-row" key={row.company}>
                <span className="lp-intel-company">
                  <span className="lp-intel-mono-chip">{row.company.charAt(0).toUpperCase()}</span>
                  {row.company}
                </span>
                <span className="lp-intel-count">
                  {row.count > 0 ? `${row.count} roles · live` : "—"}
                </span>
                <span className="lp-intel-skill">
                  {row.topSkill ? (
                    <>
                      <span className="demand-dot" aria-hidden />
                      {row.topSkill}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="lp-intel-foot">
            <span className="lp-intel-asof">{asOfLabel ? `as of ${asOfLabel}` : " "}</span>
            <Link className="lp-ghost-link" href="/intel">
              Open Live Job Data <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <div className="lp-quotes">
          {QUOTES.map((q) => (
            <figure className="lp-quote lp-reveal" key={q.who}>
              <span className="lp-quote-mark" aria-hidden>
                &ldquo;
              </span>
              <blockquote className="lp-quote-text">{q.text}</blockquote>
              <figcaption className="lp-quote-who">
                <strong>{q.who}</strong> · {q.meta}
              </figcaption>
            </figure>
          ))}
        </div>

        <NewsletterStrip companiesLabel={companiesLabel} />
      </div>
    </section>
  )
}
