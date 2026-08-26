"use client"

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { capturePrepIntentParam } from "@/lib/prep-intent-stash"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { LoginForm } from "@/components/auth/login-form"
import { AuthRouteSkeleton } from "@/components/loading/auth-route-skeleton"

function LoginRoute() {
  // Set when a signup bounced off an existing account — never make the user
  // retype an address the product already knows.
  const prefillEmail = useSearchParams().get("email")
  // A skills-led newsletter issue links here with ?intent=prep so the reader
  // lands on Preparation instead of the default surface. Marker only — see
  // lib/prep-intent-stash.ts. Read separately: auth-gate-contract pins the
  // prefill expression above verbatim.
  const intent = useSearchParams().get("intent")
  useEffect(() => { capturePrepIntentParam(intent) }, [intent])
  return (
    <AuthPageShell
      title="Welcome back"
      footerCopy={
        <>
          New here?{" "}
          <Link
            href="/signup"
            style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm surface="page" showSignupLink={false} initialEmail={prefillEmail} />
    </AuthPageShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthRouteSkeleton />}>
      <LoginRoute />
    </Suspense>
  )
}
