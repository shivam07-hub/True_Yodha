"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { JobSearchConsole } from "@/components/public/job-search-console"
import { buildIntelSearchHref } from "@/components/public/job-search-console-model"
import { SectionTitle } from "@/components/public/landing/section-title"

/* Job-gen (#33, Q2/Q3) — the secondary landing proof-search. A cold visitor
   types the kind of role they want and lands on /intel with the query preserved,
   where the public live feed shows real openings without signup. */

export function LandingJobSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")

  return (
    <section className="lp-jobgen" id="job-search" aria-label="Search live jobs">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>Or just tell us the job you want.</SectionTitle>
          <p className="lp-section-sub">
            Real openings, read straight from company career pages. No sign-up to look.
          </p>
        </div>

        <JobSearchConsole
          className="lp-reveal"
          value={query}
          onValueChange={setQuery}
          onSubmit={(value) => router.push(buildIntelSearchHref(value))}
          ariaLabel="Describe the job you want"
        />
      </div>
    </section>
  )
}
