"use client"

import { Suspense } from "react"
import Link from "next/link"
import { AuthPageShell, useNextPath } from "@/components/auth/auth-page-shell"
import { LoginForm } from "@/components/auth/login-form"
import { SampleReadout } from "@/components/public/landing/sample-readout"

function LoginRoute() {
  const next = useNextPath()
  return (
    <AuthPageShell
      title="Welcome back"
      subtitle="Sign in with the method you used to start your CV hub."
      aside={<SampleReadout eyebrow="What you'll see inside" />}
      footerCopy={
        <>
          New here?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm surface="page" next={next} showSignupLink={false} />
    </AuthPageShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginRoute />
    </Suspense>
  )
}
