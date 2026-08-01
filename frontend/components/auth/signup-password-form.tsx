"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/api"
import { errorCode } from "@/lib/api-error"
import { setSessionTokens } from "@/lib/session"
import { getStoredReferral } from "@/lib/referral"
import { clearStoredAttribution, readStoredAttribution } from "@/lib/attribution"
import { signupEvents } from "@/lib/analytics"
import { hasPendingAnonCvClaim } from "@/lib/anon-cv-claim"
import { readPendingExtensionConnect } from "@/lib/extension-connect-stash"
import { hasPendingJobSaveClaim } from "@/lib/anon-job-stash"
import { postAuthDestination } from "@/lib/auth/post-auth-destination"

interface Props {
  surface: "page" | "modal"
  onPendingEmail: (email: string) => void
  onUseMagicLink: () => void
  /** Owner of a sign-in view takes over when the email already has an account. */
  onEmailTaken?: (email: string) => void
}

export function SignupPasswordForm({
  surface,
  onPendingEmail,
  onUseMagicLink,
  onEmailTaken,
}: Props) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const normalizedEmail = email.trim().toLowerCase()

    try {
      signupEvents.methodTapped({ method: "password", surface })
      const referrer = getStoredReferral()
      const res = await auth.signup(
        normalizedEmail,
        password,
        null,
        referrer,
        readStoredAttribution(),
      )

      if (res.requires_email_confirmation) {
        onPendingEmail(normalizedEmail)
        return
      }

      if (!res.access_token) {
        setError(res.message ?? "Signup failed.")
        return
      }

      setSessionTokens({ accessToken: res.access_token, refreshToken: res.refresh_token })
      clearStoredAttribution()
      signupEvents.completed({
        method: "password",
        first_signup: "1",
        ref_attributed: referrer ? "1" : "0",
        surface,
      })
      router.push(postAuthDestination({
        firstSignup: true,
        hasPendingAnonCv: hasPendingAnonCvClaim(),
        hasPendingJobSave: hasPendingJobSaveClaim(),
        pendingExtensionConnect: readPendingExtensionConnect(),
      }))
    } catch (err) {
      const code = errorCode(err)
      signupEvents.failed({ method: "password", stage: "signup", error_code: code ?? "auth_failed" })

      // The account already exists. "Try again" is the one instruction that
      // cannot work here — hand them to sign-in with the email carried over.
      if (code === "email_taken") {
        if (onEmailTaken) {
          onEmailTaken(normalizedEmail)
        } else {
          router.push(`/login?email=${encodeURIComponent(normalizedEmail)}`)
        }
        return
      }

      setError(err instanceof Error ? err.message : "Signup failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submitPassword} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        autoComplete="email"
        inputMode="email"
        aria-label="Email address"
        className="tm-auth-magic-input"
        disabled={loading}
      />
      <div style={{ position: "relative" }}>
        <input
          type={showPassword ? "text" : "password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="new-password"
          aria-label="Password"
          className="tm-auth-magic-input"
          style={{ paddingRight: 64 }}
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", color: "var(--tm-text-faint)",
            fontSize: 12, cursor: "pointer", padding: "4px 8px",
          }}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <button
        type="submit"
        className="tm-auth-provider-btn tm-auth-provider-btn--primary"
        disabled={loading}
      >
        {loading ? "Creating..." : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => { setError(null); onUseMagicLink() }}
        style={{
          background: "none", border: "none", color: "var(--tm-text-faint)",
          fontSize: 13, cursor: "pointer", padding: 0, textAlign: "center",
        }}
      >
        <span style={{ color: "var(--tm-interactive)" }}>Email me a link instead</span>
      </button>

      {error && (
        <p role="alert" style={{
          fontSize: 13, color: "var(--tm-danger)",
          padding: "8px 12px", borderRadius: 8,
          background: "var(--tm-danger-wash)",
          border: "1px solid rgba(251,113,133,0.25)",
        }}>{error}</p>
      )}
    </form>
  )
}
