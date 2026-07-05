/**
 * PublicPlayground — the pre-login CV playground (grill 2026-06-15, CLAUDE.md
 * carry-over). A logged-out user who scored a CV on the landing lands here to
 * IMPROVE it: hide/show bullets, per-bullet Mentor rewrite, whole-CV restructure,
 * a one-page-fill meter + ATS audit, and a WYSIWYG download — all free, all
 * ephemeral (nothing is persisted; PV1).
 *
 * This is a lean shell over the SAME pure leaves the authed surface uses
 * (PdfPage, BulletRow, page-fill, ats-checks, printCvPage). It deliberately does
 * NOT reuse the authed PlaygroundView / useCVPlayground — those are per-job,
 * token + DB-bound. Zero authed regression: this file only imports pure leaves.
 *
 * Parity (grill Q7, hard constraint): the download is printCvPage() of the SAME
 * `.cvb-pdf-page` document a signed-up user exports — byte-identical, zero
 * backend, zero Chromium. DOCX + templates stay the logged-in perk.
 *
 * Gate (grill Q8 / Shivam): everything is free; login is an OPTIONAL "save"
 * upsell. Download offers "Save & download" (→ signup, claim-replays the
 * composed CV as the new Main CV) vs "Just download" (no login).
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  publicCv,
  type AnonScoreResponse,
  type AnonRewriteVariant,
  type CVStructured,
  type UserProfile,
} from "@/lib/api"
import { PdfPage, type PdfPageContact } from "@/components/cv/builder/pdf-page"
import { BulletRow } from "@/components/cv/builder/bullet-row"
import { Icon } from "@/components/cv/builder/icons"
import { RestructureLoading } from "@/components/cv/builder/restructure-loading"
import { RestructuredDoc } from "@/components/cv/builder/restructured-doc"
import { runAtsChecks, atsScore, type AtsCheck } from "@/components/cv/builder/ats-checks"
import { runContentChecks } from "@/components/cv/builder/content-checks"
import { itemId, renderDeterministic } from "@/lib/cv-compose"
import { printCvPage } from "@/lib/cv/print-cv"
import { masterFilename } from "@/lib/cv/download-master"
import {
  IDEAL_CV_SPEC, estimateLines, pageFillFromLines, pageFillBand, type PageFill,
} from "@/lib/cv/page-fill"
import { stashComposedCvText, getAnonSessionId } from "@/lib/anon-cv-stash"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"

import "@/app/(authed)/cv/cv-fonts.css"
import "@/app/(authed)/cv/cv-sheet.css"
import "@/app/(authed)/cv/cv-builder.css"
import "./public-playground.css"

const NEXT = "/cv?upload=1"

interface PublicPlaygroundProps {
  cv: CVStructured
  contact: PdfPageContact
  result: AnonScoreResponse
}

export function PublicPlayground({ cv: initialCv, contact, result }: PublicPlaygroundProps) {
  const signup = useSignupGate()
  const [cv, setCv] = useState<CVStructured>(initialCv)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // A kept whole-CV restructure overrides the SAVE payload (flat text → server
  // re-parses it on signup). The on-screen sheet stays the structured PdfPage
  // (parity), exactly like the authed surface where the export is structured.
  const [restructuredText, setRestructuredText] = useState<string | null>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [restructureOpen, setRestructureOpen] = useState(false)
  const [rewriteTarget, setRewriteTarget] = useState<RewriteTarget | null>(null)
  // Mobile only: the editor + preview stack in series is a long scroll, so on
  // narrow screens they become a toggle — Playground (default, edit-first) vs
  // Preview. Desktop ignores this and keeps the live side-by-side split so you
  // can edit and watch the sheet update at once. Driven purely by data-mtab +
  // CSS, so the desktop split is never touched.
  const [mtab, setMtab] = useState<"edit" | "preview">("edit")

  function toggle(iid: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(iid)) next.delete(iid)
      else next.add(iid)
      return next
    })
  }

  function setExpBullet(ei: number, bi: number, text: string) {
    setCv(prev => ({
      ...prev,
      experience: prev.experience.map((e, i) =>
        i !== ei ? e : { ...e, bullets: e.bullets.map((b, j) => (j !== bi ? b : text)) },
      ),
    }))
  }
  function setProjBullet(pi: number, bi: number, text: string) {
    setCv(prev => ({
      ...prev,
      projects: prev.projects.map((p, i) =>
        i !== pi ? p : { ...p, bullets: p.bullets.map((b, j) => (j !== bi ? b : text)) },
      ),
    }))
  }

  // Composed CV text for the save-on-signup replay: a kept restructure wins,
  // else the deterministic render of the current visible structured CV.
  const composedText = useMemo(
    () => restructuredText ?? renderDeterministic(cv, hidden),
    [restructuredText, cv, hidden],
  )
  useEffect(() => {
    stashComposedCvText(composedText)
  }, [composedText])

  const filename = useMemo(() => masterFilename(contact.name || null), [contact.name])

  // ATS audit — runAtsChecks only reads name + email off the profile; synthesise
  // a minimal one from the parsed contact (anon has no UserProfile).
  const fakeProfile = useMemo(
    () => ({ full_name: contact.name, email: contact.email }) as unknown as UserProfile,
    [contact.name, contact.email],
  )
  const checks = useMemo(() => runAtsChecks(cv, fakeProfile, filename), [cv, fakeProfile, filename])
  const { passed, total } = atsScore(checks)

  const pageFill = useMemo<PageFill>(() => computePageFill(cv, hidden), [cv, hidden])
  const fillBand = pageFillBand(pageFill)

  // Metadata-only download telemetry (#34 S6, Q13b=C): score + count of fixes +
  // a random anon session id. No CV body (consent-gated). Fire-and-forget.
  function recordDownload(savedIntent: boolean) {
    publicCv.recordDownloadEvent({
      anonSessionId: getAnonSessionId(),
      score: result?.score ?? null,
      fixCount: runContentChecks(cv).length,
      fileFormat: "pdf",
      savedIntent,
    })
  }
  function doDownload() {
    setDownloadOpen(false)
    recordDownload(false)
    printCvPage(filename)
  }
  function doSaveAndDownload() {
    setDownloadOpen(false)
    recordDownload(true)
    stashComposedCvText(composedText)
    printCvPage(filename)
    signup.open({ surface: "manual", next: NEXT, source: "cv_preview_save_download" })
  }

  return (
    <div className="cvp">
      <header className="cvp-head">
        <div className="cvp-head-text">
          <div className="cvp-eyebrow">CV PLAYGROUND · FREE PREVIEW</div>
          <h1 className="cvp-title">Improve your CV — the Myro way</h1>
          <p className="cvp-sub">
            Tidy your bullets, let Mentor sharpen them, and download a clean, ATS-safe
            CV. Free — sign up only when you want to save it.
          </p>
        </div>
        <div className="cvp-head-actions">
          <button type="button" className="cvb-btn sm" onClick={() => setRestructureOpen(true)}>
            <Icon name="sparkle" size={13} /> Restructure with Mentor
          </button>
          <button
            type="button"
            className="cvb-btn sm primary"
            onClick={() => setDownloadOpen(true)}
            title={pageFill.fits ? "Download your CV" : `Spills onto ${pageFill.pages} pages — trim to fit`}
          >
            <Icon name="download" size={13} /> Download CV
          </button>
        </div>
      </header>

      {/* Mobile-only view toggle (hidden on desktop, where both panes show). */}
      <div className="cvp-tabs" role="group" aria-label="Switch view">
        <button
          type="button"
          className={`cvp-tab${mtab === "edit" ? " active" : ""}`}
          aria-pressed={mtab === "edit"}
          onClick={() => setMtab("edit")}
        >
          <Icon name="sparkle" size={13} /> Playground
        </button>
        <button
          type="button"
          className={`cvp-tab${mtab === "preview" ? " active" : ""}`}
          aria-pressed={mtab === "preview"}
          onClick={() => setMtab("preview")}
        >
          <Icon name="file" size={13} /> Preview
        </button>
      </div>

      <div className="cvp-grid" data-mtab={mtab}>
        {/* Editor pane */}
        <div className="cvp-editor">
          <div className={`cvp-fill cvp-fill-${fillBand}`} aria-label="Page-fill estimate">
            <div className="cvp-fill-bar"><span style={{ width: `${Math.min(100, pageFill.pct)}%` }} /></div>
            <div className="cvp-fill-label">
              {pageFill.fits
                ? `Fits one page · ${pageFill.pct}% full`
                : `Spills onto ${pageFill.pages} pages — hide lower-impact bullets`}
            </div>
          </div>

          {result.score > 0 && (
            <div className="cvp-score-note">
              <span className="cvp-score-num">{result.score}</span>/100 ·
              {" "}{result.skills_detected} skills read. Improve below, then download.
            </div>
          )}

          <CvEditor
            cv={cv}
            hidden={hidden}
            onToggle={toggle}
            onEditExp={setExpBullet}
            onEditProj={setProjBullet}
            onRewrite={setRewriteTarget}
          />
        </div>

        {/* Live A4 preview — the exact document that downloads. The ATS & AI
            audit lives here, with the CV it grades — it's a property of the
            document, not an editor tool (so on mobile it sits under Preview). */}
        <div className="cvp-preview">
          <div className="cvb-scope">
            <PdfPage cv={cv} hidden={hidden} contact={contact} />
          </div>

          <div className="cvp-ats">
            <div className="cvp-ats-head">
              <span><Icon name="sparkle" size={13} /> ATS &amp; AI audit</span>
              <span className="cvp-ats-count">{passed}/{total} checks</span>
            </div>
            <div className="cvp-ats-grid">
              {checks.map(c => <AtsRow key={c.label} check={c} />)}
            </div>
          </div>
        </div>
      </div>

      {rewriteTarget && (
        <RewriteModal
          target={rewriteTarget}
          role={contact.title || null}
          onClose={() => setRewriteTarget(null)}
          onAccept={(text) => {
            if (rewriteTarget.kind === "exp") setExpBullet(rewriteTarget.gi, rewriteTarget.bi, text)
            else setProjBullet(rewriteTarget.gi, rewriteTarget.bi, text)
            setRewriteTarget(null)
          }}
        />
      )}

      {restructureOpen && (
        <RestructureModal
          cvText={renderDeterministic(cv, hidden)}
          kept={!!restructuredText}
          onClose={() => setRestructureOpen(false)}
          onKeep={(text) => {
            setRestructuredText(text)
            setRestructureOpen(false)
          }}
        />
      )}

      {downloadOpen && (
        <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Download your CV" onClick={() => setDownloadOpen(false)}>
          <div className="cvb-modal cvp-dl-modal" onClick={e => e.stopPropagation()}>
            <div className="cvb-modal-head"><Icon name="download" size={14} /> Download your CV</div>
            <div className="cvp-dl-body">
              <p className="cvp-dl-copy">Log in to save this CV and your edits for next time.</p>
              <div className="cvp-dl-actions">
                <button type="button" className="cvb-btn primary" onClick={doSaveAndDownload}>
                  <Icon name="save" size={14} /> Save &amp; download
                </button>
                <button type="button" className="cvb-btn ghost" onClick={doDownload}>
                  <Icon name="download" size={14} /> Just download
                </button>
              </div>
              <p className="cvp-dl-note">PDF is selectable, ATS-safe text — what you see is what downloads.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Deterministic one-page line-budget estimate over the VISIBLE content. Mirrors
 *  PlaygroundView's pageFill (DESIGN_cv_playground_redesign §5). */
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

// ── Rewrite target ──────────────────────────────────────────────────────────

type RewriteTarget = { kind: "exp" | "proj"; gi: number; bi: number; text: string }

// ── Editor ────────────────────────────────────────────────────────────────

function CvEditor({
  cv, hidden, onToggle, onEditExp, onEditProj, onRewrite,
}: {
  cv: CVStructured
  hidden: Set<string>
  onToggle: (iid: string) => void
  onEditExp: (ei: number, bi: number, text: string) => void
  onEditProj: (pi: number, bi: number, text: string) => void
  onRewrite: (t: RewriteTarget) => void
}) {
  return (
    <div className="cvp-sections">
      {cv.experience.map((e, ei) => (
        <section key={`e${ei}`} className="cvp-section">
          <h3 className="cvp-section-title">{[e.role, e.company].filter(Boolean).join(" · ") || "Experience"}</h3>
          {e.bullets.map((b, bi) => {
            const iid = itemId("exp_bullet", ei * 100 + bi, b)
            const isHidden = hidden.has(iid)
            return (
              <div key={bi} className="cvp-bullet-wrap">
                <BulletRow
                  text={b} hits={[]} hidden={isHidden} editable
                  onToggle={() => onToggle(iid)}
                  onEdit={(next) => onEditExp(ei, bi, next)}
                />
                {!isHidden && (
                  <button type="button" className="cvp-polish" onClick={() => onRewrite({ kind: "exp", gi: ei, bi, text: b })}>
                    <Icon name="sparkle" size={11} /> Polish with AI
                  </button>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {cv.projects.map((p, pi) => (
        <section key={`p${pi}`} className="cvp-section">
          <h3 className="cvp-section-title">{p.name || "Project"}</h3>
          {p.bullets.map((b, bi) => {
            const iid = itemId("proj_bullet", pi * 100 + bi, b)
            const isHidden = hidden.has(iid)
            return (
              <div key={bi} className="cvp-bullet-wrap">
                <BulletRow
                  text={b} hits={[]} hidden={isHidden} editable
                  onToggle={() => onToggle(iid)}
                  onEdit={(next) => onEditProj(pi, bi, next)}
                />
                {!isHidden && (
                  <button type="button" className="cvp-polish" onClick={() => onRewrite({ kind: "proj", gi: pi, bi, text: b })}>
                    <Icon name="sparkle" size={11} /> Polish with AI
                  </button>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function AtsRow({ check }: { check: AtsCheck }) {
  // Optional-missing is a neutral nudge, not a scored failure — so it never
  // reads as a red ✗, and the pass count (which excludes optional) matches.
  const state = check.pass ? "ok" : check.optional ? "opt" : "warn"
  return (
    <div className="cvp-ats-row">
      <span className={`cvp-ats-mark ${state}`}>
        <Icon name={check.pass ? "check" : check.optional ? "plus" : "x"} size={10} stroke={3} />
      </span>
      <span>{check.pass ? check.label : (check.detail ?? check.label)}</span>
    </div>
  )
}

// ── Rewrite modal (per-bullet Mentor) ─────────────────────────────────────

type RwPhase = "loading" | "variants" | "question" | "error"

function RewriteModal({
  target, role, onClose, onAccept,
}: {
  target: RewriteTarget
  role: string | null
  onClose: () => void
  onAccept: (text: string) => void
}) {
  const [phase, setPhase] = useState<RwPhase>("loading")
  const [variants, setVariants] = useState<AnonRewriteVariant[]>([])
  const [sel, setSel] = useState(0)
  const [question, setQuestion] = useState("")
  const [metric, setMetric] = useState("")
  const [err, setErr] = useState<string | null>(null)

  async function run(opts: { metric?: string; allowNoMetric?: boolean } = {}) {
    setPhase("loading"); setErr(null)
    try {
      const res = await publicCv.rewriteBulletVariants({
        bullet: target.text,
        role,
        metric: opts.metric ?? null,
        allow_no_metric: opts.allowNoMetric ?? false,
      })
      if (res.mode === "variants" && res.variants.length) {
        setVariants(res.variants); setSel(0); setPhase("variants")
      } else if (res.mode === "question") {
        setQuestion(res.question ?? "What was the measurable impact?"); setPhase("question")
      } else {
        setErr(res.rationale ?? "Rewrite is unavailable right now."); setPhase("error")
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Rewrite is unavailable. Try again."); setPhase("error")
    }
  }

  // Fire the rewrite once on mount — target is fixed for this modal instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, [])

  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Polish with Mentor" onClick={onClose}>
      <div className="cvb-modal cvp-rw-modal" onClick={e => e.stopPropagation()}>
        <div className="cvb-modal-head"><Icon name="sparkle" size={14} /> Polish with Mentor</div>
        <div className="cvp-rw-body">
          <div className="cvp-rw-original"><span className="cvp-rw-label">Original</span><p>{target.text}</p></div>

          {phase === "loading" && <div className="cvp-rw-status" role="status">✦ Mentor is writing three versions…</div>}

          {phase === "error" && (
            <>
              <p className="cvp-rw-error" role="alert">{err}</p>
              <div className="cvp-rw-foot">
                <button type="button" className="cvb-btn sm" onClick={onClose}>Close</button>
                <button type="button" className="cvb-btn sm primary" onClick={() => void run()}>Try again</button>
              </div>
            </>
          )}

          {phase === "question" && (
            <>
              <p className="cvp-rw-question">{question}</p>
              <textarea
                className="cvp-rw-input"
                rows={2}
                placeholder="e.g. cut load time 40%, saved 12 hrs/week"
                value={metric}
                onChange={e => setMetric(e.target.value)}
              />
              <div className="cvp-rw-foot">
                <button type="button" className="cvb-btn sm" onClick={() => void run({ allowNoMetric: true })}>
                  Rewrite without a number
                </button>
                <button
                  type="button"
                  className="cvb-btn sm primary"
                  disabled={!metric.trim()}
                  onClick={() => void run({ metric: metric.trim() })}
                >
                  Use this number
                </button>
              </div>
            </>
          )}

          {phase === "variants" && variants.length > 0 && (
            <>
              <div className="cvp-rw-pick-label">Pick the version that tells your story best</div>
              <div className="cvp-rw-tabs" role="tablist">
                {variants.map((v, i) => (
                  <button
                    key={v.angle}
                    type="button"
                    role="tab"
                    aria-selected={i === sel}
                    className={`cvp-rw-tab${i === sel ? " active" : ""}`}
                    onClick={() => setSel(i)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="cvp-rw-suggestion"><p>{variants[sel]?.text}</p></div>
              <div className="cvp-rw-foot">
                <button type="button" className="cvb-btn sm" onClick={onClose}>Discard</button>
                <button type="button" className="cvb-btn sm primary" onClick={() => onAccept(variants[sel]?.text ?? "")}>
                  <Icon name="check" size={12} /> Use this version
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Restructure modal (whole-CV Mentor) ───────────────────────────────────

type RsPhase = "loading" | "proposal" | "error"

function RestructureModal({
  cvText, kept, onClose, onKeep,
}: {
  cvText: string
  kept: boolean
  onClose: () => void
  onKeep: (text: string) => void
}) {
  const [phase, setPhase] = useState<RsPhase>("loading")
  const [proposed, setProposed] = useState("")
  const [changes, setChanges] = useState<string[]>([])
  const [rationale, setRationale] = useState<string | null>(null)
  const [playbook, setPlaybook] = useState<string | null>(null)
  const [uncertainty, setUncertainty] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    setPhase("loading"); setErr(null)
    try {
      const res = await publicCv.restructure({ cv_text: cvText })
      if (res.mode === "proposal" && res.proposed_text) {
        setProposed(res.proposed_text)
        setChanges(res.changes)
        setRationale(res.rationale); setPlaybook(res.playbook); setUncertainty(res.uncertainty)
        setPhase("proposal")
      } else {
        setErr(res.rationale ?? "Restructure is unavailable right now."); setPhase("error")
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Restructure is unavailable. Try again."); setPhase("error")
    }
  }

  // Propose once on mount — the source CV text is fixed for this modal instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, [])

  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Restructure with Mentor" onClick={onClose}>
      <div className="cvb-modal cvb-rs-modal" onClick={e => e.stopPropagation()}>
        <div className="cvb-modal-head"><Icon name="sparkle" size={14} /> Restructure with Mentor</div>

        {phase === "loading" && (
          <div className="cvb-rs-body">
            <RestructureLoading note="Usually about 15 seconds. Mentor only reorders and tightens your lines — it never invents anything." />
          </div>
        )}

        {phase === "error" && (
          <div className="cvb-rs-body">
            <p className="cvb-rs-error" role="alert">{err}</p>
            <div className="cvb-rs-foot">
              <button type="button" className="cvb-btn sm" onClick={onClose}>Close</button>
              <button type="button" className="cvb-btn sm primary" onClick={() => void run()}>Try again</button>
            </div>
          </div>
        )}

        {phase === "proposal" && (
          <div className="cvb-rs-body">
            {changes.length > 0 && (
              <div className="cvb-rs-changes">
                <div className="cvb-rs-label">What changed</div>
                <ul className="cvb-rs-change-list">
                  {changes.map((c, i) => <li key={i}><Icon name="check" size={12} stroke={3} aria-hidden /> <span>{c}</span></li>)}
                </ul>
              </div>
            )}
            <div className="cvb-rs-preview" aria-label="Proposed CV"><RestructuredDoc text={proposed} /></div>
            {(rationale || playbook || uncertainty) && (
              <details className="cvb-rs-why">
                <summary>Why this works</summary>
                {rationale && <p className="cvb-rs-why-reason">{rationale}</p>}
                {playbook && <p className="cvb-rs-why-src"><span>Playbook</span> {playbook}</p>}
                {uncertainty && <p className="cvb-rs-why-honest"><Icon name="x" size={11} stroke={3} aria-hidden /> {uncertainty} Keep a line only if it&rsquo;s true.</p>}
              </details>
            )}
            <p className="cvp-rs-note">Keeping it sets this as the CV you&rsquo;ll save when you sign up — free.</p>
            <div className="cvb-rs-foot">
              <button type="button" className="cvb-btn sm" onClick={onClose}>Discard</button>
              <button type="button" className="cvb-btn sm primary" onClick={() => onKeep(proposed)}>
                <Icon name="check" size={12} /> {kept ? "Replace kept draft" : "Keep this"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
