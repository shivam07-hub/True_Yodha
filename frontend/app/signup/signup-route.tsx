"use client"

import { useSearchParams } from "next/navigation"
import { capturePrepIntentParam } from "@/lib/prep-intent-stash"
import { useEffect, useState } from "react"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { SignupForm } from "@/components/auth/signup-form"
import { SampleReadout } from "@/components/public/landing/sample-readout"
import { readStashedResult } from "@/lib/anon-cv-stash"
import type { AnonScoreResponse } from "@/lib/api"
import Link from "next/link"

export function SignupRoute() {
  // Same newsletter lane as /login — see lib/prep-intent-stash.ts.
  const intent = useSearchParams().get("intent")
  useEffect(() => { capturePrepIntentParam(intent) }, [intent])
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
      subtitle="Score. Tailor. Apply."
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
                We scored your CV, but could not rebuild it. Create a free account
                to build a clean version section by section.
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
            href="/login"
            style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm surface="page" showLoginLink={false} />
    </AuthPageShell>
  )
}
