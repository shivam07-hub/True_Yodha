"use client"

import { AuthPageShell, useNextPath } from "@/components/auth/auth-page-shell"
import { SignupForm } from "@/components/auth/signup-form"
import Link from "next/link"

export function SignupRoute() {
  const next = useNextPath()
  return (
    <AuthPageShell
      title="Start your CV hub"
      subtitle="Score your CV against live jobs. Keep every version you tailor. One account, everything from upload to apply."
      footerCopy={
        <>
          Already have an account?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            style={{ color: "var(--tm-accent)", textDecoration: "none" }}
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
