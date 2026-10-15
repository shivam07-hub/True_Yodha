"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { emitLoopStep, jobs, onboarding } from "@/lib/api"
import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"
import { useJobImport } from "@/lib/job-import/use-job-import"
import { newExtensionJob } from "@/lib/onboarding/new-extension-job"

import "./job-choice.css"

const DOOR_JOB = "onboarding"

/**
 * The step after skills when there is no direction: three ways to name a job.
 * Paste and the extension finish on the tailored CV. Jobs that fit is Direction.
 */
export function JobChoice({ token, onFit }: { token: string; onFit: () => void }) {
  const router = useRouter()
  const firstDoor = useRef<HTMLButtonElement>(null)
  const importJob = useJobImport(token)
  const [mode, setMode] = useState<"choose" | "paste" | "extension">("choose")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState("")
  const known = useRef<Set<string> | null>(null)
  const finishRef = useRef<(jobId: string) => void>(() => {})

  useEffect(() => {
    firstDoor.current?.focus()
    emitLoopStep(token, "door_shown", DOOR_JOB, "onboarding")
  }, [token])

  async function finish(jobId: string) {
    setSaving(true)
    setError(null)
    try {
      emitLoopStep(token, "job_imported", jobId, "onboarding")
      const receipt = await onboarding.acceptFirstJob(token, jobId)
      router.replace(receipt.tailor_href)
    } catch (exc) {
      setSaving(false)
      setError(exc instanceof Error ? exc.message : "That job could not be saved.")
    }
  }

  useEffect(() => {
    if (mode !== "extension") return
    let stopped = false
    async function look() {
      const rows = await jobs.applications(token).catch(() => [])
      if (stopped) return
      if (known.current === null) {
        known.current = new Set(rows.map((row) => row.job_id).filter(Boolean))
        return
      }
      const found = newExtensionJob(known.current, rows)
      if (found) {
        stopped = true
        void finishRef.current(found)
      }
    }
    void look()
    const timer = window.setInterval(() => void look(), 4000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [mode, token])

  finishRef.current = finish

  const draft = importJob.state.step === "review" || importJob.state.step === "importing"
    ? importJob.state
    : null

  async function savePaste() {
    const imported = await importJob.confirm()
    if (imported) void finish(imported.jobId)
  }

  return (
    <section className="tm-job-choice">
      <h1>Which job do you want?</h1>
      <div role="group" aria-label="How do you want to choose a job" className="tm-job-choice-doors">
        <Button
          ref={firstDoor}
          variant={mode === "paste" ? "solid" : "outline"}
          onClick={() => {
            setMode("paste")
            emitLoopStep(token, "door_paste", DOOR_JOB, "onboarding")
          }}
        >
          Paste a job
        </Button>
        <Button
          className="tm-job-choice-extension"
          variant={mode === "extension" ? "solid" : "outline"}
          render={<a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noreferrer" />}
          onClick={() => {
            setMode("extension")
            emitLoopStep(token, "door_extension", DOOR_JOB, "onboarding")
          }}
        >
          Save it with the extension
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            emitLoopStep(token, "door_fit", DOOR_JOB, "onboarding")
            onFit()
          }}
        >
          Jobs that fit
        </Button>
      </div>

      {mode === "paste" && (
        <div className="tm-job-choice-paste">
          {importJob.state.step === "idle" || (importJob.state.step === "failed" && importJob.state.canPasteInstead) ? (
            <div className="tm-job-choice-fetch">
              <input
                aria-label="Job link"
                placeholder="Paste a link"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
              <Button variant="solid" onClick={() => void importJob.submitLink(sourceUrl)}>
                Fetch
              </Button>
              <Button variant="outline" onClick={() => importJob.pasteInstead()}>Type it in</Button>
              <label className="tm-job-choice-file">
                Upload a file
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importJob.submitFile(file)
                  }}
                />
              </label>
            </div>
          ) : null}
          {importJob.state.step === "extracting" && <p>Reading the job…</p>}
          {importJob.state.step === "failed" && <p role="alert">{importJob.state.reason}</p>}
          {draft && (
            <div className="tm-job-choice-review">
              <label>
                Role
                <input aria-label="Role" value={draft.role} onChange={(event) => importJob.updateReview({ role: event.target.value })} />
              </label>
              <label>
                Company
                <input aria-label="Company" value={draft.company} onChange={(event) => importJob.updateReview({ company: event.target.value })} />
              </label>
              <label>
                Description
                <textarea aria-label="Job description" value={draft.jd} onChange={(event) => importJob.updateReview({ jd: event.target.value })} />
              </label>
              <Button variant="solid" disabled={saving || importJob.state.step === "importing"} onClick={() => void savePaste()}>
                {saving || importJob.state.step === "importing" ? "Saving…" : "Tailor a CV for this"}
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "extension" && (
        <p className="tm-job-choice-wait">
          Save a job in the extension. This page continues when it arrives.
          {" "}
          <button type="button" className="tm-job-choice-instead" onClick={() => {
            setMode("paste")
            emitLoopStep(token, "door_paste", DOOR_JOB, "onboarding")
          }}>
            Paste a job instead
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
