"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AuthPageShell, useNextPath } from "@/components/auth/auth-page-shell"
import { LoginForm } from "@/components/auth/login-form"

function LoginRoute() {
  const next = useNextPath()
  // Set when a signup bounced off an existing account — never make the user
  // retype an address the product already knows.
  const prefillEmail = useSearchParams().get("email")
  return (
    <AuthPageShell
      title="Welcome back"
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
      <LoginForm surface="page" next={next} showSignupLink={false} initialEmail={prefillEmail} />
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
