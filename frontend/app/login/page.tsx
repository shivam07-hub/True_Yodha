"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { LoginForm } from "@/components/auth/login-form"

function LoginRoute() {
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
    <Suspense fallback={null}>
      <LoginRoute />
    </Suspense>
  )
}
