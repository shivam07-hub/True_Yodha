"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { EdgeGlow } from "@/components/loading/edge-glow"
import { createClient } from "@/lib/supabase"
import { getAccessToken } from "@/lib/session"
import { partnerConnect, type PartnerConnectContext } from "@/lib/api"

/**
 * Partner account-connect consent screen.
 *
 * A partner (Finlatics, a college) hands one of their users to Myro. When that
 * user's email already has a Myro account, the partner is NOT given a sign-in
 * url — nothing has proved their user owns the account already sitting on that
 * address. They are sent here instead, and the OWNER approves.
 *
 * Two ways through, neither of which leaves the flow:
 *   • already signed in on this device → one click. No email.
 *   • not signed in → Google, which returns via /auth/callback carrying
 *     link_partner + partner_external_id, and post-signin completes the link.
 *
 * "Email me a link instead" stays as a third option for someone who can do
 * neither, but it is the user's choice, never the default path.
 */

type Phase = "loading" | "ready" | "invalid" | "linking" | "done" | "emailed"

function ConnectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("t") ?? ""

  const [phase, setPhase] = useState<Phase>("loading")
  const [context, setContext] = useState<PartnerConnectContext | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setPhase("invalid")
      return
    }
    setSignedIn(Boolean(getAccessToken()))
    partnerConnect
      .context(token)
      .then((ctx) => {
        setContext(ctx)
        setPhase("ready")
      })
      .catch(() => setPhase("invalid"))
  }, [token])

  const approve = useCallback(async () => {
    const accessToken = getAccessToken()
    if (!accessToken) return
    setPhase("linking")
    setError(null)
    try {
      await partnerConnect.approve(accessToken, token)
      setPhase("done")
      router.replace("/market")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect right now.")
      setPhase("ready")
    }
  }, [router, token])

  const continueWithGoogle = useCallback(() => {
    if (!context) return
    const params = new URLSearchParams({
      link_partner: context.partner_slug,
      partner_external_id: context.external_id,
    })
    createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?${params.toString()}` },
    })
  }, [context])

  const emailInstead = useCallback(async () => {
    await partnerConnect.emailLink(token).catch(() => undefined)
    setPhase("emailed")
  }, [token])

  if (phase === "loading") return <EdgeGlow message="" />

  if (phase === "invalid") {
    return (
      <Shell title="This link has expired">
        <p className="text-[0.9375rem] leading-relaxed text-[var(--tm-text-secondary)]">
          Open Myro again from your partner’s site.
        </p>
      </Shell>
    )
  }

  if (phase === "emailed") {
    return (
      <Shell title="Check your inbox">
        <p className="text-[0.9375rem] leading-relaxed text-[var(--tm-text-secondary)]">
          Link sent to {context?.email_masked}.
        </p>
      </Shell>
    )
  }

  if (phase === "done") return <EdgeGlow message="" />

  const partnerName = context?.partner_name ?? "Your partner"

  return (
    <Shell title={`${partnerName} wants to connect your Myro account`}>
      <p className="text-[0.9375rem] text-[var(--tm-text-secondary)]">{context?.email_masked}</p>

      {error ? (
        <p className="text-[0.875rem] leading-relaxed text-[var(--tm-danger,#d5493f)]">{error}</p>
      ) : null}

      <div className="flex flex-col gap-3 pt-2">
        {signedIn ? (
          <Button size="lg" onClick={approve} disabled={phase === "linking"}>
            {phase === "linking" ? "Connecting…" : "Connect"}
          </Button>
        ) : (
          <Button size="lg" onClick={continueWithGoogle}>
            Sign in to connect
          </Button>
        )}
        <button
          type="button"
          onClick={emailInstead}
          className="text-[0.875rem] text-[var(--tm-text-secondary)] underline underline-offset-4 hover:text-[var(--tm-text-primary)]"
        >
          Email me a link instead
        </button>
      </div>
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-[26rem] flex-col gap-4">
        <h1 className="text-balance text-[1.375rem] font-semibold leading-snug text-[var(--tm-text-primary)]">
          {title}
        </h1>
        {children}
      </div>
    </main>
  )
}

export default function PartnerConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectInner />
    </Suspense>
  )
}
