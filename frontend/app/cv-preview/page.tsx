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
 * An upload from the landing carries the visitor's pick as `?role=&level=`
 * (spec #66 L7). The score then comes back with the CV read against that role,
 * and the first screen is the gap (RoleGap) before the playground.
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
import { RoleGap } from "@/components/public/cv-preview/role-gap"
import { roleLabel } from "@/components/public/landing/role-match"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { publicCv, type AnonPick, type AnonScoreResponse } from "@/lib/api"
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

/** The landing pick this upload carries. Read at score time, client-side only. */
function readPick(): AnonPick | null {
  const params = new URLSearchParams(window.location.search)
  const role = params.get("role")
  return role ? { role, level: params.get("level") } : null
}

export default function CvPreviewPage() {
  const router = useRouter()
  const signup = useSignupGate()
  // A pick-carrying score opens on the gap; "Fix my CV" moves to the playground.
  // Once opened the playground stays mounted, so its edits survive a look back.
  const [view, setView] = useState<"gap" | "fix">("gap")
  const [fixOpened, setFixOpened] = useState(false)
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
        const r = await publicCv.scorePreview(file, readPick())
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
        setError(e instanceof Error ? e.message : "We couldn't read that CV. Try another file, or paste your CV text.")
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
        const r = await publicCv.scorePreview({ text }, readPick())
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
  const target = result?.target ?? null

  function showView(next: "gap" | "fix") {
    setView(next)
    if (next === "fix") setFixOpened(true)
    window.scrollTo({ top: 0 })
  }
  const onGap = !!target && view === "gap"

  return (
    <div className="tm-landing">
      <PublicTopNav active="home" showSignIn />
      <main>
        {!hydrated ? null : scoring ? (
          <div>
            <ScoringConsole />
            {slow && (
              <div style={{ maxWidth: 560, margin: "18px auto 0", textAlign: "center" }}>
                <p style={{ fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", marginBottom: 10 }}>
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
          <>
            {target && onGap ? (
              <RoleGap
                target={target}
                cv={result.cv!}
                onJobs={() => signup.open({ surface: "manual", source: "cv_preview_reach" })}
                onFix={() => showView("fix")}
              />
            ) : null}
            {!onGap || fixOpened ? (
              <div hidden={onGap}>
                <PublicPlayground
                  cv={result.cv!}
                  contact={toContact(result)}
                  result={result}
                  targetRole={target ? roleLabel(target.family) : null}
                  onBack={target ? () => showView("gap") : undefined}
                />
              </div>
            ) : null}
          </>
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
              <p style={{ marginTop: 14, textAlign: "center", fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)" }}>
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
