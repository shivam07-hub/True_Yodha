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
import { LandingDropzone } from "@/components/public/landing/dropzone"
import { ScoringConsole } from "@/components/public/cv-preview/scoring-console"
import { PublicPlayground } from "@/components/public/cv-preview/public-playground"
import { publicCv, type AnonScoreResponse } from "@/lib/api"
import { readStashedResult, stashAnonCv, takeStashedFile } from "@/lib/anon-cv-stash"
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
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const score = useCallback(
    async (file: File) => {
      setScoring(true)
      setError(null)
      try {
        const r = await publicCv.scorePreview(file)
        // Re-stash the File + result: the File feeds claim-on-signup later, the
        // result lets /signup render the score readout for a degraded parse.
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
    setHydrated(true)
    if (file) void score(file)
  }, [score])

  const canBuild = !!result?.cv

  return (
    <div className="tm-landing">
      <PublicTopNav active="home" showSignIn />
      <main>
        {!hydrated ? null : scoring ? (
          <ScoringConsole />
        ) : canBuild && result ? (
          <PublicPlayground cv={result.cv!} contact={toContact(result)} result={result} />
        ) : (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "72px 20px 96px" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tm-text)", margin: 0 }}>
                Drop your CV to start building
              </h1>
              <p style={{ marginTop: 10, fontSize: 15, color: "var(--tm-text-muted)" }}>
                Get your Myro Score, then improve and download a clean CV — free, no signup.
              </p>
            </div>
            <LandingDropzone source="cv_preview_dropzone" busy={scoring} onFile={score} />
            {error && (
              <p style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--tm-danger, #ef4444)" }}>{error}</p>
            )}
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
