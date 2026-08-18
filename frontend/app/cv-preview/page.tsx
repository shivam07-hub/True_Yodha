"use client"

/**
 * /cv-preview — the pre-login CV playground + the single scoring orchestrator
 * (grill 2026-06-19, navigate-then-load).
 *
 * Funnel: a logged-out user drops a CV anywhere on the landing → the dropzone
 * stashes the File and jumps here → this page scores it (ScoringConsole shows
 * the Engine reading it) → then forks:
 *   - structured CV  → open the PublicPlayground (experience it once, free).
 *   - degraded parse → /signup, where the score readout sits beside the form.
 * A direct hit (no stash) shows a dropzone so the user can score → build here.
 *
 * Public chrome only (top-nav + footer), NO app shell. Everything is ephemeral
 * and free; login is an optional save upsell (handled inside PublicPlayground).
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { CVUploadStep } from "@/components/cv/cv-upload-step"
import { ScoringConsole } from "@/components/public/cv-preview/scoring-console"
import { PublicPlayground } from "@/components/public/cv-preview/public-playground"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { publicCv, type AnonScoreResponse } from "@/lib/api"
import { readStashedResult, stashAnonCv, stashAnonCvResult, stashComposedCvText, takeStashedFile, takeStashedText } from "@/lib/anon-cv-stash"
import type { PdfPageContact } from "@/components/cv/builder/pdf-page"

function toContact(r: AnonScoreResponse): PdfPageContact {
  return {
    name: r.contact?.name?.trim() || "Your name",
    title: r.contact?.title ?? "",
    location: r.contact?.location ?? "",
    email: r.contact?.email ?? "",
    phone: r.contact?.phone ?? "",
    linkedin: r.contact?.linkedin ?? "",
  }
}

export default function CvPreviewPage() {
  const router = useRouter()
  const [result, setResult] = useState<AnonScoreResponse | null>(null)
  const [scoring, setScoring] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [text, setText] = useState("")

  const score = useCallback(
    async (file: File) => {
      setScoring(true)
      setError(null)
      try {
        const r = await publicCv.scorePreview(file)
        // Re-stash the File + result. A structured result also stores rendered
        // CV text so post-auth claim survives full-page auth redirects.
        stashAnonCv(file, r)
        if (r.cv) {
          setResult(r)
          setScoring(false)
        } else {
          // Can't rebuild the CV — send them to signup with their score showing.
          router.replace("/signup")
        }
      } catch (e) {
        setScoring(false)
        setError(e instanceof Error ? e.message : "We couldn't read that CV. Try a text-based PDF or DOCX.")
      }
    },
    [router],
  )

  // Paste path (#4): score raw text directly — no file transport. Same fork as
  // score(); claim-on-signup replays the pasted text (no File to stash).
  const scoreText = useCallback(
    async (text: string) => {
      setScoring(true)
      setError(null)
      try {
        const r = await publicCv.scorePreview({ text })
        stashAnonCvResult(r)
        stashComposedCvText(text)
        if (r.cv) {
          setResult(r)
          setScoring(false)
        } else {
          router.replace("/signup")
        }
      } catch (e) {
        setScoring(false)
        setError(e instanceof Error ? e.message : "We couldn't score that text. Add a few more lines of your CV.")
      }
    },
    [router],
  )

  // Watchdog (#4): if scoring hasn't returned in 15s, stop hiding behind a
  // naked spinner — offer the paste escape (Vaibhav's frozen-upload case).
  useEffect(() => {
    if (!scoring) {
      setSlow(false)
      return
    }
    const id = setTimeout(() => setSlow(true), 15_000)
    return () => clearTimeout(id)
  }, [scoring])

  // Seed from the landing drop: a stashed result means we already scored (e.g.
  // back-nav); a stashed File means we landed here to score it now.
  useEffect(() => {
    const stashed = readStashedResult()
    if (stashed) {
      setResult(stashed)
      setHydrated(true)
      return
    }
    const file = takeStashedFile()
    const text = file ? null : takeStashedText()
    setHydrated(true)
    if (file) void score(file)
    else if (text) void scoreText(text)
  }, [score, scoreText])

  const canBuild = !!result?.cv

  return (
    <div className="tm-landing">
      <PublicTopNav active="home" showSignIn />
      <main>
        {!hydrated ? null : scoring ? (
          <div>
            <ScoringConsole />
            {slow && (
              <div style={{ maxWidth: 560, margin: "18px auto 0", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 10 }}>
                  This is taking longer than usual. You can keep waiting, or paste your CV text to score it instantly.
                </p>
                <button
                  type="button"
                  className="lp-paste-score"
                  onClick={() => { setScoring(false); setPasteOpen(true); setError(null) }}
                >
                  Paste text instead
                </button>
              </div>
            )}
          </div>
        ) : canBuild && result ? (
          <PublicPlayground cv={result.cv!} contact={toContact(result)} result={result} />
        ) : (
          <div className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-5xl items-center justify-center px-5 py-8 sm:px-8">
            <CVUploadStep busy={scoring} error={error} inputSource="cv_preview_dropzone" onUpload={score}>
              {pasteOpen ? (
                <div className="mt-5">
                  <label htmlFor="cv-preview-text" className="text-sm font-medium text-[var(--tm-text)]">Paste your CV text instead</label>
                  <textarea id="cv-preview-text" value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder="Experience, skills, education…" className="tm-control-focus mt-2 w-full resize-y rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 text-base leading-6 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]" disabled={scoring} autoFocus />
                  <div className="mt-3 flex justify-center gap-3">
                    <Button type="button" disabled={scoring || text.trim().length < 40} onClick={() => scoreText(text.trim())}>Score my text</Button>
                    <Button type="button" variant="outline" disabled={scoring} onClick={() => setPasteOpen(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button type="button" variant="outline" onClick={() => setPasteOpen(true)}>No CV? Paste your CV text</Button>
                  <Button variant="outline" render={<a href="/intel" target="_blank" rel="noopener noreferrer" />}>
                    Browse jobs instead <ExternalLink className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
              <p className="mt-4 text-center text-xs text-[var(--tm-text-faint)]">Your CV is saved only if you choose to create an account.</p>
            </CVUploadStep>
            {result && !canBuild && (
              <p style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--tm-text-muted)" }}>
                We scored your CV ({result.score}/100) but couldn&rsquo;t read its structure cleanly enough to rebuild it.
                Try a text-based PDF or DOCX export.
              </p>
            )}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  )
}
