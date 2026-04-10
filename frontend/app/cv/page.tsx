"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { FileText, Loader2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { StepCV } from "@/components/onboarding/step-cv"
import { jobs, scores, uploadCV } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

export default function CVPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(file: File) {
    if (!token) return
    setUploading(true)
    setError(null)
    setMessage(null)

    try {
      const result = await uploadCV(token, file)
      await scores.compute(token)
      await jobs.compute(token).catch(() => null)
      queryClient.invalidateQueries({ queryKey: ["scores", token] })
      queryClient.invalidateQueries({ queryKey: ["jobs", token] })
      setMessage(`${result.skills_detected} skill signals detected. Your score is ${result.score}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload CV")
    } finally {
      setUploading(false)
    }
  }

  if (!ready) return null

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4" />
            Your CV
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a PDF or DOCX. Mirror extracts skills and refreshes your market match.
          </p>
        </div>

        <div className="rounded-lg border border-border px-4 py-8">
          <StepCV onNext={handleUpload} />
        </div>

        {uploading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading your CV and matching it to the market...
          </p>
        )}
        {message && <p className="text-xs text-emerald-700">{message}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </AppShell>
  )
}
