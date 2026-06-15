"use client"

/**
 * /cv-preview — the pre-login CV playground (grill 2026-06-15).
 *
 * Funnel (grill Q8 = score first, then playground): the landing dropzone scores
 * a CV → the Readout shows the score → "Improve & download my CV →" lands here,
 * seeded from the browser-stashed scored CV. A direct hit (no stash) shows a
 * dropzone so the user can score → build in one place.
 *
 * Public chrome only (top-nav + footer), NO app shell. Everything is ephemeral
 * and free; login is an optional save upsell (handled inside PublicPlayground).
 */

import { useEffect, useState } from "react"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { LandingDropzone } from "@/components/public/landing/dropzone"
import { PublicPlayground } from "@/components/public/cv-preview/public-playground"
import { readStashedResult } from "@/lib/anon-cv-stash"
import type { AnonScoreResponse } from "@/lib/api"
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
  const [result, setResult] = useState<AnonScoreResponse | null>(null)
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Seed from the landing scan (sessionStorage survives the route change).
  useEffect(() => {
    setResult(readStashedResult())
    setHydrated(true)
  }, [])

  // Only the structured CV unlocks the builder; a degraded parse (cv === null)
  // falls back to the score-first dropzone.
  const canBuild = !!result?.cv

  return (
    <div className="tm-landing">
      <PublicTopNav active="home" showSignIn />
      <main>
        {hydrated && canBuild && result ? (
          <PublicPlayground cv={result.cv!} contact={toContact(result)} result={result} />
        ) : (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px 96px" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tm-text)", margin: 0 }}>
                Drop your CV to start building
              </h1>
              <p style={{ marginTop: 10, fontSize: 15, color: "var(--tm-text-muted)" }}>
                Get your Myro Score, then improve and download a clean CV — free, no signup.
              </p>
            </div>
            <LandingDropzone
              source="cv_preview_dropzone"
              busy={scoring}
              onScoring={() => { setScoring(true); setError(null) }}
              onResult={(r) => { setResult(r); setScoring(false) }}
              onError={(m) => { setError(m); setScoring(false) }}
            />
            {error && (
              <p style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "var(--tm-danger, #ef4444)" }}>{error}</p>
            )}
            {hydrated && result && !canBuild && (
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
