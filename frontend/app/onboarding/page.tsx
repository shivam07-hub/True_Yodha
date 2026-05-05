"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { StepCV } from "@/components/onboarding/step-cv"
import { StepRole } from "@/components/onboarding/step-role"
import { StepScore } from "@/components/onboarding/step-score"
import { uploadCV, uploadCVText, jobs, scores, users } from "@/lib/api"
import type { ScoreResponse } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

type Step = "cv" | "role" | "score"

export default function OnboardingPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const [step, setStep] = useState<Step>("cv")
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvText, setCvText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null)

  function handleCVNext(file: File) {
    setCvFile(file)
    setCvText(null)
    setStep("role")
  }

  function handleCVTextNext(text: string) {
    setCvText(text)
    setCvFile(null)
    setStep("role")
  }

  async function handleRoleNext(roles: string[], location: string) {
    if (!token) {
      sessionStorage.setItem("pending_roles", JSON.stringify(roles))
      sessionStorage.setItem("pending_location", location)
      router.push("/login")
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Update profile with target roles + location
      await users.updateProfile(token, {
        target_roles: roles,
        target_location: location,
      })

      // 2. Upload CV or text description
      if (cvFile) {
        await uploadCV(token, cvFile)
      } else if (cvText) {
        await uploadCVText(token, cvText)
      }

      // 3. CV upload already persisted the score — fetch it directly.
      // scores.compute is not needed here; it was already run inside cv_workflow.
      const result = await scores.me(token)
      void jobs.compute(token).catch(() => null)
      setScoreData(result)
      setStep("score")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const STEPS: Step[] = ["cv", "role", "score"]
  const stepIndex = STEPS.indexOf(step)

  if (!ready) return null

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--tm-bg)", color: "var(--tm-text)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "var(--tm-tracking-tight)", color: "var(--tm-accent)" }}>
          Myro
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {STEPS.map((s, i) => (
              <div
                key={s}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i <= stepIndex ? "var(--tm-accent)" : "var(--tm-border)",
                  transition: "background var(--tm-dur) var(--tm-ease)",
                }}
              />
            ))}
          </div>
          {step !== "score" && (
            <button
              type="button"
              onClick={() => router.push("/market")}
              aria-label="Skip onboarding"
              style={{
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "var(--tm-font-sans)", fontSize: 22, lineHeight: 1, fontWeight: 300,
                color: "var(--tm-text-muted)", borderRadius: "var(--tm-radius)",
                transition: "color var(--tm-dur) var(--tm-ease)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-text)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        {error && (
          <div style={{ marginBottom: 24, width: "100%", maxWidth: 448, background: "var(--tm-danger-wash)", border: "1px solid rgba(251,113,133,0.3)", borderRadius: "var(--tm-radius)", padding: "12px 16px" }}>
            <p style={{ fontSize: 13, color: "var(--tm-danger)" }}>{error}</p>
          </div>
        )}

        {step === "cv" && <StepCV onNext={handleCVNext} onNextText={handleCVTextNext} />}
        {step === "role" && <StepRole onNext={handleRoleNext} loading={loading} />}
        {step === "score" && scoreData && <StepScore score={scoreData} />}
      </div>
    </main>
  )
}
