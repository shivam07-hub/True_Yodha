"use client"

import { Suspense } from "react"
import Link from "next/link"
import { AuthPageShell, useNextPath } from "@/components/auth/auth-page-shell"
import { LoginForm } from "@/components/auth/login-form"

function LoginRoute() {
  const next = useNextPath()
  return (
    <AuthPageShell
      title="Welcome back"
      subtitle="Sign in with the method you used to start your CV hub."
      footerCopy={
        <>
          New here?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            style={{ color: "var(--tm-accent)", textDecoration: "none" }}
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
