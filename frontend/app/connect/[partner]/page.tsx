"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PostAuthHandoffSkeleton } from "@/components/loading/post-auth-handoff-skeleton"
import { AuthRouteSkeleton } from "@/components/loading/auth-route-skeleton"
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
 *
 * A LAPSED token gets its own screen rather than the dead end. 24 partner
 * users reached this page holding a token a concurrent SSO call had already
 * replaced, were told to go back to their partner's site, and never returned.
 * The seat is still real for a week after the token lapses, so the screen
 * offers a fresh link instead. It cannot offer Connect — the server refuses an
 * approve on a lapsed token, and the button would be a lie.
 */

type Phase = "loading" | "ready" | "expired" | "invalid" | "linking" | "done" | "emailed"

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
        // A lapsed token is not a dead end. The seat is real and the person is
        // here — the screen offers them a fresh link rather than sending them
        // back out to the partner's site to start again.
        setPhase(ctx.expired ? "expired" : "ready")
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

  if (phase === "loading") return <PostAuthHandoffSkeleton />

  if (phase === "expired") {
    return (
      <Shell title="This link has expired">
        <p className="text-[0.9375rem] leading-relaxed text-[var(--tm-text-secondary)]">
          We’ll send a fresh one to {context?.email_masked}.
        </p>
        <div className="pt-2">
          <Button size="lg" onClick={emailInstead}>
            Send a new link
          </Button>
        </div>
      </Shell>
    )
  }

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

  if (phase === "done") return <PostAuthHandoffSkeleton />

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
    <Suspense fallback={<AuthRouteSkeleton />}>
      <ConnectInner />
    </Suspense>
  )
}
