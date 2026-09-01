/**
 * PublicPlayground — the pre-login CV playground (grill 2026-06-15).
 *
 * A logged-out user who scored a CV on the landing lands here to IMPROVE it,
 * on the SAME WorkstationShell the authed surfaces use (hierarchy redesign,
 * handoff 2a). Everything is free and ephemeral (nothing persisted; PV1).
 *
 * What the shared shell fixed here specifically:
 *   · the ATS tab was a read-only pass/fail grid — a logged-out user saw a red
 *     ✗ on "Summary is empty" with nothing to click. ATS rows are now ordinary,
 *     actionable rows in the one queue (§4.4).
 *   · the rewrite ran in a modal with its own copy of the state machine, which
 *     never learned `suggest_metric`. It is the same inline card, same machine.
 *   · with no Skills lane to hand the rail to, a clean CV now ends on the
 *     terminal card — verdict, score delta, Download — and a dashed invite that
 *     names what logging in buys (§5).
 *
 * Parity (ADR-0020, hard constraint): the download renders the SAME visible
 * `.cvb-pdf-page` through the SAME server Chromium renderer the authed export
 * uses, via the anon twin POST /public/cv/export-pdf. `window.print()` is the
 * fallback ONLY (503 / no sheet). DOCX + templates stay the logged-in perk.
 *
 * Gate (grill Q8 / Shivam): everything is free; login is an OPTIONAL "save"
 * upsell, never a gate on the download itself.
 */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  publicCv,
  type AnonScoreResponse,
  type CVStructured,
  type UserProfile,
} from "@/lib/api"
import { PdfPage, type PdfPageContact } from "@/components/cv/builder/pdf-page"
import { Icon } from "@/components/cv/builder/icons"
import { PlaygroundHeader } from "@/components/cv/builder/playground-header"
import { WorkstationShell } from "@/components/cv/builder/workstation-shell"
import { CvMatchInvite, CvTerminalCard } from "@/components/cv/builder/cv-rail-clear"
import { identityLines } from "@/components/cv/builder/cv-identity-lines"
import { rewriteFetcher } from "@/components/cv/builder/rewrite-fetchers"
import { runAtsChecks } from "@/components/cv/builder/ats-checks"
import { useCvDiagnosis } from "@/components/cv/builder/use-cv-diagnosis"
import { runContentChecks } from "@/components/cv/builder/content-checks"
import { itemId, renderDeterministic } from "@/lib/cv-compose"
import { printCvPage } from "@/lib/cv/print-cv"
import { exportAnonSheetPdf } from "@/lib/cv/sheet-pdf"
import { masterFilename } from "@/lib/cv/download-master"
import {
  IDEAL_CV_SPEC, estimateLines, pageFillFromLines, type PageFill,
} from "@/lib/cv/page-fill"
import { stashComposedCvText, getAnonSessionId } from "@/lib/anon-cv-stash"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { AnonRestructureModal } from "./anon-restructure-modal"

import "@/app/(authed)/cv/cv-fonts.css"
import "@/app/(authed)/cv/cv-sheet.css"
import "@/app/(authed)/cv/cv-builder.css"
import "@/app/(authed)/cv/playground-v2.css"
import "@/app/(authed)/cv/cv-workstation.css"
import "./public-playground.css"

interface PublicPlaygroundProps {
  cv: CVStructured
  contact: PdfPageContact
  result: AnonScoreResponse
}

export function PublicPlayground({ cv: initialCv, contact, result }: PublicPlaygroundProps) {
  const router = useRouter()
  const signup = useSignupGate()
  const [cv, setCv] = useState<CVStructured>(initialCv)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // A kept whole-CV restructure overrides the SAVE payload (flat text → server
  // re-parses it on signup). The on-screen sheet stays the structured PdfPage
  // (parity), exactly like the authed surface where the export is structured.
  const [restructuredText, setRestructuredText] = useState<string | null>(null)
  const [restructureOpen, setRestructureOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // The visible preview wrapper — the SAME `.cvb-pdf-page` sheet gets serialized
  // and rendered server-side (ADR-0020), so the PDF === the preview.
  const sheetRef = useRef<HTMLDivElement>(null)

  function toggle(iid: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(iid)) next.delete(iid)
      else next.add(iid)
      return next
    })
  }

  function patch(mut: (draft: CVStructured) => CVStructured) {
    setCv(prev => mut(structuredClone(prev)))
  }

  function replaceLine(oldText: string, newText: string) {
    patch(d => {
      for (const e of d.experience) {
        const i = e.bullets.indexOf(oldText)
        if (i >= 0) { e.bullets[i] = newText; return d }
      }
      for (const p of d.projects) {
        const i = p.bullets.indexOf(oldText)
        if (i >= 0) { p.bullets[i] = newText; return d }
      }
      if (d.summary === oldText) d.summary = newText
      else if (d.skills_line === oldText) d.skills_line = newText
      return d
    })
  }

  // Composed CV text for the save-on-signup replay: a kept restructure wins,
  // else the deterministic render of the current visible structured CV.
  const composedText = useMemo(
    () => restructuredText ?? renderDeterministic(cv, hidden),
    [restructuredText, cv, hidden],
  )
  useEffect(() => { stashComposedCvText(composedText) }, [composedText])

  const filename = useMemo(() => masterFilename(contact.name || null), [contact.name])

  // runAtsChecks only reads name + email off the profile; synthesise a minimal
  // one from the parsed contact (anon has no UserProfile).
  const fakeProfile = useMemo(
    () => ({ full_name: contact.name, email: contact.email }) as unknown as UserProfile,
    [contact.name, contact.email],
  )
  const atsChecks = useMemo(() => runAtsChecks(cv, fakeProfile, filename), [cv, fakeProfile, filename])
  const pageFill = useMemo<PageFill>(() => computePageFill(cv, hidden), [cv, hidden])
  // ONE scan per change, same hook as both authed surfaces.
  const diagnosis = useCvDiagnosis({ cv, hidden, atsChecks })

  const lineCount = useMemo(() => {
    let n = 0
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hidden.has(itemId("exp_bullet", ei * 100 + bi, b))) n += 1
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hidden.has(itemId("proj_bullet", pi * 100 + bi, b))) n += 1
    }))
    return n
  }, [cv, hidden])
  const wordCount = useMemo(
    () => composedText.trim() ? composedText.trim().split(/\s+/).length : 0,
    [composedText],
  )

  // Metadata-only download telemetry (#34 S6, Q13b=C): score + count of fixes +
  // a random anon session id. No CV body (consent-gated). Fire-and-forget.
  function recordDownload(savedIntent: boolean) {
    publicCv.recordDownloadEvent({
      anonSessionId: getAnonSessionId(),
      score: result?.score ?? null,
      fixCount: runContentChecks(cv, hidden).length,
      fileFormat: "pdf",
      savedIntent,
    })
  }

  async function doDownload() {
    if (downloading) return
    recordDownload(false)
    setDownloading(true)
    try {
      const sheet = sheetRef.current?.querySelector<HTMLElement>(".cvb-pdf-page")
      if (!sheet) { printCvPage(filename); return }
      try {
        await exportAnonSheetPdf(sheet, filename)
      } catch {
        // Server renderer down (503 / network) → native browser print of the
        // same visible sheet is the WYSIWYG fallback, so a PDF always lands.
        printCvPage(filename)
      }
    } finally {
      setDownloading(false)
    }
  }

  function doLogInToSave() {
    recordDownload(true)
    stashComposedCvText(composedText)
    signup.open({ surface: "manual", source: "cv_preview_save_download" })
  }

  return (
    <>
      <WorkstationShell
        className="cvp-anon"
        railLabel="Improve your CV"
        header={
          <PlaygroundHeader
            variant="master"
            brandLabel="CV Playground"
            masterMeta="Match this CV to jobs →"
            onMeta={() => signup.open({ surface: "manual", source: "cv_preview_match" })}
            scoreCaption="/100 · your CV score"
            jobTitle="" company="" reqCount={0}
            ready={result.score} delta={0}
            canApply
            primaryLabel={downloading ? "Preparing…" : "Download CV"}
            applyHint={pageFill.fits ? "Download your CV" : `Spills onto ${pageFill.pages} pages`}
            saveState=""
            hideOverflow
            onBack={() => router.push("/")}
            onReqPill={() => {}}
            onApply={() => void doDownload()}
            onDownload={() => void doDownload()}
          />
        }
        cv={cv}
        identity={identityLines(cv, fakeProfile)}
        hidden={hidden}
        targeted={false}
        atsChecks={atsChecks}
        diagnosis={diagnosis}
        pageFill={pageFill}
        lineCount={lineCount}
        wordCount={wordCount}
        makeFetcher={(bullet, fix) =>
          rewriteFetcher.anon(bullet, { role: contact.title || null, fix, quantifyOnly: fix?.kind === "Quantify" })}
        onApplyRewrite={({ oldText, newText }) => replaceLine(oldText, newText)}
        onEditLine={replaceLine}
        onToggleHidden={toggle}
        onPatch={patch}
        onAddBullet={(roleIndex, text) => patch(d => {
          const ri = d.experience[roleIndex] ? roleIndex : d.experience.length - 1
          if (ri >= 0) d.experience[ri].bullets.push(text)
          return d
        })}
        // Logged out there are no Skills — the JD is what unlocks them — so the
        // rail has no second lane and a clear CV ends on the terminal card.
        skillsLabel={null}
        terminal={
          <>
            <CvTerminalCard
              title="Recruiter-ready"
              sub="Every line carries a number. One page. Reads clean to an ATS."
              score={result.score}
              ctaLabel="Download CV"
              ctaBusy={downloading}
              onCta={() => void doDownload()}
            />
            <CvMatchInvite
              onMatch={() => signup.open({ surface: "manual", source: "cv_preview_match" })}
            />
          </>
        }
        railFooter={
          <>
            <button type="button" className="cvw-railfoot-btn" onClick={() => setRestructureOpen(true)}>
              <Icon name="sparkle" size={13} /> Restructure
            </button>
            <button type="button" className="cvw-railfoot-btn plain" onClick={doLogInToSave}>
              Log in to save this CV
            </button>
          </>
        }
        sheet={
          <div className="cvb-scope">
            <PdfPage cv={cv} hidden={hidden} contact={contact} />
          </div>
        }
      />

      {restructureOpen && (
        <AnonRestructureModal
          cvText={renderDeterministic(cv, hidden)}
          kept={!!restructuredText}
          onClose={() => setRestructureOpen(false)}
          onKeep={text => { setRestructuredText(text); setRestructureOpen(false) }}
        />
      )}

      {/* The canonical download source, always mounted. The SHEET tab renders
          its own visible copy, but a user who never opens that tab must still
          get a WYSIWYG PDF (ADR-0020) — so the serialized sheet lives here,
          where no tab state can unmount it. */}
      <div ref={sheetRef} hidden aria-hidden="true">
        <PdfPage cv={cv} hidden={hidden} contact={contact} />
      </div>
    </>
  )
}

/** Deterministic one-page line-budget estimate over the VISIBLE content.
 *  Mirrors PlaygroundView's pageFill (DESIGN_cv_playground_redesign §5). */
function computePageFill(cv: CVStructured, hidden: Set<string>): PageFill {
  const cpl = IDEAL_CV_SPEC.charsPerLine
  let lines = 3 // contact header
  if (cv.summary && !hidden.has(itemId("summary", 0, cv.summary))) lines += 1 + estimateLines(cv.summary, cpl)
  let expVisible = false
  cv.experience.forEach((e, ei) => {
    const kept = e.bullets.filter((b, bi) => !hidden.has(itemId("exp_bullet", ei * 100 + bi, b)))
    if (kept.length) { expVisible = true; lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0) }
  })
  if (expVisible) lines += 1
  let projVisible = false
  cv.projects.forEach((p, pi) => {
    const kept = p.bullets.filter((b, bi) => !hidden.has(itemId("proj_bullet", pi * 100 + bi, b)))
    if (kept.length) { projVisible = true; lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0) }
  })
  if (projVisible) lines += 1
  const eduVisible = cv.education
    .map((ed, i) => ({ line: [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · "), i }))
    .filter(({ line, i }) => !hidden.has(itemId("edu", i, line)))
  if (eduVisible.length) lines += 1 + eduVisible.length
  if (cv.skills_line && !hidden.has(itemId("skills_line", 0, cv.skills_line))) lines += 1 + estimateLines(cv.skills_line, cpl)
  const certVisible = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))
  if (certVisible.length) lines += 1 + certVisible.length
  return pageFillFromLines(lines)
}
