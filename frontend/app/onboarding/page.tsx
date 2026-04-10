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

  async function handleRoleNext(role: string, location: string) {
    if (!token) {
      sessionStorage.setItem("pending_role", role)
      sessionStorage.setItem("pending_location", location)
      router.push("/login")
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Update profile with target role + location
      await users.updateProfile(token, {
        target_roles: [role],
        target_location: location,
      })

      // 2. Upload CV if we have one
      if (cvFile) {
        await uploadCV(token, cvFile)
      }

      // 3. Compute score
      const result = await scores.compute(token)
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
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <span className="text-lg font-semibold tracking-tight">Mirror</span>
        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                i <= stepIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {error && (
          <div className="mb-6 w-full max-w-md bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {step === "cv" && <StepCV onNext={handleCVNext} />}
        {step === "role" && <StepRole onNext={handleRoleNext} loading={loading} />}
        {step === "score" && scoreData && <StepScore score={scoreData} />}
      </div>
    </main>
  )
}
