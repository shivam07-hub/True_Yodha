"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { AccountDeletionPanel } from "@/components/settings/account-deletion-panel"
import {
  clearAccountDeletionReturn,
  stashAccountDeletionReturn,
} from "@/lib/account-deletion-return"
import { loginRedirectTarget, useSession } from "@/lib/hooks/use-auth"

export function DeleteAccount() {
  const router = useRouter()
  const { token, ready } = useSession()

  useEffect(() => {
    if (!ready) return
    if (token) {
      clearAccountDeletionReturn()
      return
    }
    stashAccountDeletionReturn()
    router.replace(loginRedirectTarget())
  }, [ready, token, router])

  return (
    <div
      className="tm-page-canvas"
      style={{
        minHeight: "100vh",
        fontFamily: "var(--tm-font-sans)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PublicTopNav showSignIn />
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "var(--tm-content-max)",
          margin: "0 auto",
          padding: "48px var(--tm-page-px) 64px",
        }}
      >
        <p
          style={{
            fontSize: "var(--tm-fs-caption)",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--tm-interactive)",
            margin: "0 0 12px",
          }}
        >
          Legal
        </p>
        <h1
          style={{
            fontSize: "var(--tm-fs-hero)",
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            margin: "0 0 28px",
            color: "var(--tm-text)",
          }}
        >
          Delete your account
        </h1>

        <h2
          style={{
            fontSize: "var(--tm-fs-heading)",
            fontWeight: 600,
            margin: "0 0 8px",
            color: "var(--tm-text)",
          }}
        >
          What is deleted
        </h2>
        <ul
          style={{
            margin: "0 0 16px",
            paddingLeft: 18,
            color: "var(--tm-text)",
            fontSize: "var(--tm-fs-body)",
            lineHeight: "var(--tm-lh-body)",
          }}
        >
          <li>Your sign-in</li>
          <li>Your CVs and the files uploaded with them</li>
          <li>Your profile, and the activity stored on the account</li>
        </ul>
        <p
          style={{
            margin: "0 0 28px",
            color: "var(--tm-text-muted)",
            fontSize: "var(--tm-fs-body)",
            lineHeight: "var(--tm-lh-body)",
          }}
        >
          A job or other shared record you added stays up. Your name is taken off it.
        </p>

        <h2
          style={{
            fontSize: "var(--tm-fs-heading)",
            fontWeight: 600,
            margin: "0 0 8px",
            color: "var(--tm-text)",
          }}
        >
          How
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--tm-text)",
            fontSize: "var(--tm-fs-body)",
            lineHeight: "var(--tm-lh-body)",
          }}
        >
          Sign in. Type DELETE. Press Erase permanently. This finishes immediately and cannot be undone.
        </p>
        <p
          style={{
            margin: "12px 0 0",
            color: "var(--tm-text-muted)",
            fontSize: "var(--tm-fs-body)",
            lineHeight: "var(--tm-lh-body)",
          }}
        >
          If it does not finish, write to{" "}
          <a href="mailto:grievance@himyro.com" style={{ color: "var(--tm-interactive)" }}>
            grievance@himyro.com
          </a>
          .
        </p>

        {token ? <AccountDeletionPanel token={token} /> : null}
      </main>
      <PublicFooter />
    </div>
  )
}
