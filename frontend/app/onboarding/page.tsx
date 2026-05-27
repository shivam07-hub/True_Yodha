"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { StepCV } from "@/components/onboarding/step-cv"
import { StepRole } from "@/components/onboarding/step-role"
import { StepCompanies } from "@/components/onboarding/step-companies"
import type { CVAnalysisStatus } from "@/components/onboarding/step-companies"
import { StepScore } from "@/components/onboarding/step-score"
import { NinjaNameStep } from "@/components/onboarding/NinjaNameStep"
import { uploadCV, uploadCVText, scores, users } from "@/lib/api"
import type { CVUploadResult, CVUploadSource, ScoreResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useXPStore } from "@/store/xpStore"
import { useOnboardingHandoff } from "@/store/onboardingHandoff"
import { MyroLogo } from "@/components/myro-logo"

type Step = "cv" | "role" | "companies" | "ninja" | "score"

type CVUploadCompletion =
  | { ok: true; result: CVUploadResult }
  | { ok: false; message: string }

type CVUploadTask =
  | { status: "idle"; promise: null; result: null; message: null }
  | { status: "running"; promise: Promise<CVUploadCompletion>; result: null; message: null }
  | { status: "done"; promise: null; result: CVUploadResult; message: null }
  | { status: "failed"; promise: null; result: null; message: string }

const INITIAL_CV_UPLOAD_TASK: CVUploadTask = {
  status: "idle",
  promise: null,
  result: null,
  message: null,
}

export default function OnboardingPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { token, ready } = useAuth()
  const setXPBalance = useXPStore((s) => s.setBalance)
  const [step, setStep] = useState<Step>("cv")
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvText, setCvText] = useState<string | null>(null)
  const [cvSource, setCvSource] = useState<CVUploadSource>("pdf_upload")
  const [profileSaving, setProfileSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null)
  const [cvUploadTask, setCVUploadTask] = useState<CVUploadTask>(INITIAL_CV_UPLOAD_TASK)

  function handleCVNext(file: File, source: CVUploadSource = "pdf_upload") {
    setCvFile(file)
    setCvText(null)
    setCvSource(source)
    setCVUploadTask(INITIAL_CV_UPLOAD_TASK)
    setStep("role")
  }

  function handleCVTextNext(text: string) {
    setCvText(text)
    setCvFile(null)
    setCvSource("text_describe")
    setCVUploadTask(INITIAL_CV_UPLOAD_TASK)
    setStep("role")
  }

  // A CV picked on /welcome lands here via the in-memory handoff. Consume it
  // once on mount and jump straight past the upload step.
  const consumeHandoffCVFile = useOnboardingHandoff((s) => s.consumeCVFile)
  useEffect(() => {
    const handoff = consumeHandoffCVFile()
    if (handoff) handleCVNext(handoff)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function beginCVUpload(currentToken: string): Promise<CVUploadCompletion> {
    if (cvUploadTask.status === "running") return cvUploadTask.promise
    if (cvUploadTask.status === "done") return Promise.resolve({ ok: true, result: cvUploadTask.result })
    if (cvUploadTask.status === "failed") return Promise.resolve({ ok: false, message: cvUploadTask.message })

    const runner = cvFile
      ? uploadCV(currentToken, cvFile, cvSource)
      : cvText
        ? uploadCVText(currentToken, cvText, "text_describe")
        : Promise.reject(new Error("Add a CV before continuing."))

    const promise = runner
      .then((result): CVUploadCompletion => {
        if (typeof result.new_xp_balance === "number") {
          setXPBalance(result.new_xp_balance)
        }
        queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
        queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
        queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
        setCVUploadTask({ status: "done", promise: null, result, message: null })
        return { ok: true, result }
      })
      .catch((err): CVUploadCompletion => {
        const message = err instanceof Error ? err.message : "CV analysis failed."
        setCVUploadTask({ status: "failed", promise: null, result: null, message })
        return { ok: false, message }
      })

    setCVUploadTask({ status: "running", promise, result: null, message: null })
    return promise
  }

  async function finishCVUpload(currentToken: string): Promise<CVUploadResult> {
    const completion = await beginCVUpload(currentToken)
    if (!completion.ok) throw new Error(completion.message)
    return completion.result
  }

  async function handleRoleNext(roles: string[], location: string) {
    if (!token) {
      sessionStorage.setItem("pending_roles", JSON.stringify(roles))
      sessionStorage.setItem("pending_location", location)
      router.push("/login")
      return
    }

    setProfileSaving(true)
    setError(null)

    try {
      // 1. Update profile with target roles + location
      await users.updateProfile(token, {
        target_roles: roles,
        target_location: location,
      })
      beginCVUpload(token)
      setStep("companies")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleCompaniesNext() {
    if (!token) {
      router.push("/login")
      return
    }
    setFinishing(true)
    setError(null)
    try {
      await finishCVUpload(token)
      const result = await scores.me(token)
      setScoreData(result)
      setStep("ninja")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setFinishing(false)
    }
  }

  function restartCVUpload() {
    setError(null)
    setFinishing(false)
    setCVUploadTask(INITIAL_CV_UPLOAD_TASK)
    setStep("cv")
  }

  const STEPS: Step[] = ["cv", "role", "companies", "ninja", "score"]
  const stepIndex = STEPS.indexOf(step)
  const cvStatus = cvUploadTask.status as CVAnalysisStatus

  if (!ready) return null

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--tm-bg)", color: "var(--tm-text)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--tm-border-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MyroLogo size={24} />
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "var(--tm-tracking-tight)", color: "var(--tm-interactive)" }}>
            Myro
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {STEPS.map((s, i) => (
              <div
                key={s}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i <= stepIndex ? "var(--tm-interactive)" : "var(--tm-border)",
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
        {step === "role" && <StepRole onNext={handleRoleNext} loading={profileSaving} />}
        {step === "companies" && token && (
          <StepCompanies
            token={token}
            cvStatus={cvStatus}
            cvError={cvUploadTask.message}
            finishing={finishing}
            onBack={() => setStep("role")}
            onRestartCV={restartCVUpload}
            onNext={handleCompaniesNext}
          />
        )}
        {step === "ninja" && (
          <NinjaNameStep
            onAccept={() => setStep("score")}
            onSkip={() => setStep("score")}
          />
        )}
        {step === "score" && scoreData && <StepScore score={scoreData} />}
      </div>
    </main>
  )
}
