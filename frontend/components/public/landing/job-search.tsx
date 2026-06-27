"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, ArrowRight, Loader2 } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"
import { publicCv, type PublicJobSearchResponse } from "@/lib/api"

/* Job-gen (#33, Q2/Q3) — the secondary landing proof-search. A cold visitor
   types the kind of role they want; we parse it and return REAL openings from
   the live feed (never fabricated). It proves the moat ("these are real, right
   now") at lower friction than uploading a CV. Save/apply stay gated to signup —
   this surface only shows that the roles exist. */

const EXAMPLES = [
  "Product roles in Bangalore",
  "Remote data analyst jobs",
  "Frontend engineer, Pune",
]

function locationLabel(card: PublicJobSearchResponse["cards"][number]): string | null {
  const parts = [card.location_city, card.location_country].filter(Boolean)
  const place = parts.length ? parts.join(", ") : card.location
  const mode = card.location_mode && card.location_mode !== "onsite" ? card.location_mode : null
  return [place, mode].filter(Boolean).join(" · ") || null
}

export function LandingJobSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PublicJobSearchResponse | null>(null)

  async function run(q: string) {
    const term = q.trim()
    if (term.length < 2) return
    setLoading(true)
    setError(null)
    try {
      const res = await publicCv.searchJobs({ query: term })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search is unavailable right now.")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const relaxedLocation = result?.relaxed.includes("location")

  return (
    <section className="lp-jobgen" id="job-search" aria-label="Search live jobs">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>Or just tell us the job you want.</SectionTitle>
          <p className="lp-section-sub">
            Real openings, read straight from company career pages. No sign-up to look.
          </p>
        </div>

        <form
          className="lp-jobgen-bar lp-reveal"
          onSubmit={(e) => {
            e.preventDefault()
            void run(query)
          }}
        >
          <Search size={18} strokeWidth={1.5} aria-hidden className="lp-jobgen-bar-icon" />
          <input
            className="lp-jobgen-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. product roles in Bangalore, under 3 yrs"
            aria-label="Describe the job you want"
            maxLength={200}
          />
          <button className="lp-jobgen-go" type="submit" disabled={loading || query.trim().length < 2}>
            {loading ? <Loader2 size={16} className="lp-spin" aria-hidden /> : "Find roles"}
          </button>
        </form>

        {!result && !loading && (
          <div className="lp-jobgen-examples lp-reveal">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="lp-jobgen-chip"
                onClick={() => {
                  setQuery(ex)
                  void run(ex)
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {error && <p className="lp-jobgen-note lp-jobgen-error">{error}</p>}

        {result && (
          <div className="lp-jobgen-results lp-reveal">
            {result.cards.length === 0 ? (
              <p className="lp-jobgen-note">
                No live roles matched “{result.interpreted.role}” right now. Try a broader role,
                or upload your CV above to get matched as new openings land.
              </p>
            ) : (
              <>
                <p className="lp-jobgen-meta">
                  {result.total} live {result.total === 1 ? "role" : "roles"} for{" "}
                  <strong>{result.interpreted.role}</strong>
                  {result.interpreted.location_city ? ` in ${result.interpreted.location_city}` : ""}
                  {relaxedLocation ? " — showing the closest real matches." : "."}
                </p>

                <ul className="lp-jobgen-list">
                  {result.cards.map((card) => {
                    const loc = locationLabel(card)
                    return (
                      <li key={card.job_id} className="lp-jobgen-card">
                        <div className="lp-jobgen-card-main">
                          <span className="lp-jobgen-card-title">{card.title}</span>
                          <span className="lp-jobgen-card-sub">
                            {card.company || "Company undisclosed"}
                            {loc ? (
                              <>
                                {" "}
                                <MapPin size={12} strokeWidth={1.5} aria-hidden /> {loc}
                              </>
                            ) : null}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="lp-jobgen-card-cta"
                          onClick={() => router.push("/signup")}
                        >
                          See your fit <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <button type="button" className="lp-jobgen-unlock" onClick={() => router.push("/signup")}>
                  Sign up free to save these, see your fit, and tailor a CV per role
                  <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
