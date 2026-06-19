"use client"

import { useEffect, useState } from "react"
import { AuthPageShell, useNextPath } from "@/components/auth/auth-page-shell"
import { SignupForm } from "@/components/auth/signup-form"
import { SampleReadout } from "@/components/public/landing/sample-readout"
import { readStashedResult } from "@/lib/anon-cv-stash"
import type { AnonScoreResponse } from "@/lib/api"
import Link from "next/link"

export function SignupRoute() {
  const next = useNextPath()

  // A user routed here from /cv-preview after scoring a CV whose structure we
  // couldn't rebuild (degraded parse) — show their REAL score beside the form
  // instead of the sample. Read after mount (sessionStorage is client-only).
  const [scored, setScored] = useState<AnonScoreResponse | null>(null)
  useEffect(() => setScored(readStashedResult()), [])

  // Degraded = scored but no structured CV. That's the only path that bounced
  // here from /cv-preview; tell the user why the playground couldn't open.
  const degraded = !!scored && !scored.cv

  return (
    <AuthPageShell
      title="Start your CV hub"
      subtitle="Score your CV against live jobs. Keep every version you tailor. One account, everything from upload to apply."
      aside={
        scored ? (
          <>
            <SampleReadout
              eyebrow="Your Myro Score"
              title="What the Engine read in your CV."
              result={scored}
            />
            {degraded && (
              <p
                style={{
                  marginTop: 14,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: "var(--tm-text-muted)",
                }}
              >
                We scored your CV, but its file structure was too incomplete to rebuild
                automatically. Create a free account and onboarding walks you through building
                a clean, complete CV — section by section.
              </p>
            )}
          </>
        ) : (
          <SampleReadout eyebrow="What you'll see inside" />
        )
      }
      footerCopy={
        <>
          Already have an account?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm surface="page" next={next} showLoginLink={false} />
    </AuthPageShell>
  )
}
