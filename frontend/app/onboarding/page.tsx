"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { StepCV } from "@/components/onboarding/step-cv"
import { StepRole } from "@/components/onboarding/step-role"
import { StepScore } from "@/components/onboarding/step-score"
import { uploadCV, jobs, scores, users } from "@/lib/api"
import type { ScoreResponse } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

type Step = "cv" | "role" | "score"

export default function OnboardingPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const [step, setStep] = useState<Step>("cv")
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null)

  function handleCVNext(file: File) {
    setCvFile(file)
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

      // 2. Upload CV if we have one
      if (cvFile) {
        await uploadCV(token, cvFile)
      }

      // 3. CV upload already persisted the score — just fetch it
      const result = await scores.me(token)
      await jobs.compute(token).catch(() => null)
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
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--tm-bg)", color: "var(--tm-text)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "var(--tm-tracking-tight)", color: "var(--tm-accent)" }}>
          Truth Mirror
        </span>
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
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        {error && (
          <div style={{ marginBottom: 24, width: "100%", maxWidth: 448, background: "var(--tm-danger-wash)", border: "1px solid rgba(251,113,133,0.3)", borderRadius: "var(--tm-radius)", padding: "12px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--tm-danger)" }}>{error}</p>
          </div>
        )}

        {step === "cv" && <StepCV onNext={handleCVNext} />}
        {step === "role" && <StepRole onNext={handleRoleNext} loading={loading} />}
        {step === "score" && scoreData && <StepScore score={scoreData} />}
      </div>
    </main>
  )
}
