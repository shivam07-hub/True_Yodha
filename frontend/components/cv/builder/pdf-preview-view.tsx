/**
 * PdfPreviewView — enterprise PDF page render + ATS audit card.
 *
 * Light-on-light page with crisp typography; tactical-dark surround.
 * Downloads via the existing /cv/download-pdf endpoint, passing the
 * deterministic snapshot text composed from the playground state.
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import type { CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { cv as cvApi } from "@/lib/api"
import { itemId, renderDeterministic } from "@/lib/cv-compose"
import { Icon } from "./icons"
import { runAtsChecks, atsScore } from "./ats-checks"

interface PdfPreviewViewProps {
  token: string
  cv: CVStructured
  hidden: Set<string>
  selectedVersion: CVVersion | null
  profile: UserProfile | null
  company: string
  jobTitle: string
  matchScore: number
  jobId?: string | null
  onBackToPlayground: () => void
}

function slug(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

export function PdfPreviewView({
  token, cv, hidden, selectedVersion, profile, company, jobTitle, matchScore, jobId, onBackToPlayground,
}: PdfPreviewViewProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // sessionStorage fallback: job match % may be missing on direct URL / refresh.
  const [effectiveScore, setEffectiveScore] = useState(matchScore)
  useEffect(() => {
    if (effectiveScore <= 0 && jobId) {
      try {
        const stored = sessionStorage.getItem(`myro-cv-score-${jobId}`)
        if (stored) setEffectiveScore(Number(stored))
      } catch { /* storage blocked */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const filename = useMemo(() => {
    const parts = [slug(profile?.full_name) || "myro_cv", slug(company), slug(jobTitle)].filter(Boolean)
    return `${parts.join("__")}.pdf`
  }, [profile, company, jobTitle])

  const checks = useMemo(() => runAtsChecks(cv, profile, filename), [cv, profile, filename])
  const { passed: passedCount, total: totalChecks } = atsScore(checks)

  // Snapshot text to send to the PDF endpoint — uses the version's polished
  // text if available, otherwise the deterministic render of the current state.
  const snapshotText = useMemo(() => {
    if (selectedVersion?.polished_text?.trim()) return selectedVersion.polished_text
    return renderDeterministic(cv, hidden)
  }, [selectedVersion, cv, hidden])

  async function handleDownload() {
    setDownloadError(null)
    setDownloading(true)
    try {
      const blob = await cvApi.downloadPdf(token, snapshotText)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not generate PDF.")
    } finally {
      setDownloading(false)
    }
  }

  const contact = {
    name: profile?.full_name?.trim() || "Your name",
    title: cv.experience[0]?.role ?? "",
    location: profile?.target_location ?? "",
    email: profile?.email ?? "",
    phone: "",
    linkedin: profile?.linkedin_url ?? "",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div className="cvb-pdf-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="cvb-btn ghost" onClick={onBackToPlayground}>
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }}/> Back to playground
          </button>
          <div>
            <div className="eyebrow mono">pdf preview</div>
            <div style={{ fontSize: 13, color: "var(--tm-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="file" size={14} style={{ color: "var(--tm-accent)" }}/>
              <span className="mono">{filename}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="cvb-pill success">
            <Icon name="check" size={11}/> ATS-friendly · single column
          </span>
          {effectiveScore > 0 && (
            <span className="cvb-pill accent">
              <Icon name="sparkle" size={11}/> {effectiveScore}% JD match
            </span>
          )}
          <button type="button" className="cvb-btn primary" onClick={handleDownload} disabled={downloading}>
            <Icon name="download" size={14}/>
            {downloading ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="cvb-pdf-stage">
        <PdfPage cv={cv} hidden={hidden} contact={contact} company={company}/>

        {downloadError && (
          <div role="alert" className="cvb-pill danger" style={{ padding: "8px 14px", fontSize: 12 }}>
            {downloadError}
          </div>
        )}

        <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 11.5, color: "var(--tm-text-faint)", flexWrap: "wrap" }}>
          <span className="mono">A4 · 1 page · 100% scale</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Renders as native text + shapes — fully ATS-parseable.</span>
        </div>

        <div style={{
          width: 816, maxWidth: "100%",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius)",
          padding: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="sparkle" size={14} style={{ color: "var(--tm-accent)" }}/>
              <span className="eyebrow" style={{ color: "var(--tm-accent)" }}>ATS &amp; AI audit</span>
            </div>
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: passedCount === totalChecks ? "var(--tm-success)" : "var(--tm-warning)",
              }}
            >
              passes {passedCount} / {totalChecks} checks
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {checks.map(c => (
              <AuditRow key={c.label} ok={c.pass} label={c.pass ? c.label : (c.detail ?? c.label)}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tm-text-muted)" }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4,
        background: ok ? "var(--tm-success-wash)" : "var(--tm-warning-wash)",
        border: "1px solid " + (ok ? "rgba(74,222,128,0.3)" : "rgba(245,158,11,0.3)"),
        display: "grid", placeItems: "center",
        color: ok ? "var(--tm-success)" : "var(--tm-warning)",
      }}>
        <Icon name={ok ? "check" : "x"} size={10} stroke={3}/>
      </span>
      <span>{label}</span>
    </div>
  )
}

interface PdfPageProps {
  cv: CVStructured
  hidden: Set<string>
  contact: { name: string; title: string; location: string; email: string; phone: string; linkedin: string }
  company: string
}

function PdfPage({ cv, hidden, contact, company }: PdfPageProps) {
  const renderBullets = (bullets: string[], section: "exp_bullet" | "proj_bullet", ei: number) =>
    bullets.filter((b, bi) => !hidden.has(itemId(section, ei * 100 + bi, b)))

  const visibleExperience = cv.experience.map((e, ei) => ({
    ...e,
    keptBullets: renderBullets(e.bullets, "exp_bullet", ei),
  })).filter(e => e.keptBullets.length > 0)

  const visibleProjects = cv.projects.map((p, pi) => ({
    ...p,
    keptBullets: renderBullets(p.bullets, "proj_bullet", pi),
  })).filter(p => p.keptBullets.length > 0)

  const visibleEdu = cv.education.filter((ed, i) => {
    const line = [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · ")
    return !hidden.has(itemId("edu", i, line))
  })

  const summaryHidden = cv.summary ? hidden.has(itemId("summary", 0, cv.summary)) : true
  const skillsHidden = cv.skills_line ? hidden.has(itemId("skills_line", 0, cv.skills_line)) : true
  const visibleCerts = cv.certs.filter((c, i) => !hidden.has(itemId("cert", i, c)))

  return (
    <div className="cvb-pdf-page">
      <h1 className="pdf-name">{contact.name}</h1>
      {contact.title && <div className="pdf-title">{contact.title}</div>}
      <div className="pdf-contact">
        {contact.location && <span>{contact.location}</span>}
        {contact.email && <span>{contact.email}</span>}
        {contact.phone && <span>{contact.phone}</span>}
        {contact.linkedin && <span>{contact.linkedin}</span>}
      </div>

      {cv.summary && !summaryHidden && (
        <>
          <h2>Summary</h2>
          <div className="pdf-summary">{cv.summary}</div>
        </>
      )}

      {visibleExperience.length > 0 && (
        <>
          <h2>Experience</h2>
          {visibleExperience.map((e, ei) => (
            <div key={ei}>
              <div className="pdf-role-head">
                <div>
                  <span className="pdf-role">{e.role}</span>
                  {e.company && <span className="pdf-co"> · {e.company}</span>}
                </div>
                {e.dates && <span className="pdf-dates">{e.dates}</span>}
              </div>
              <ul>{e.keptBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))}
        </>
      )}

      {visibleProjects.length > 0 && (
        <>
          <h2>Projects</h2>
          {visibleProjects.map((p, pi) => (
            <div key={pi}>
              <div className="pdf-role-head">
                <div><span className="pdf-role">{p.name}</span></div>
                {p.dates && <span className="pdf-dates">{p.dates}</span>}
              </div>
              <ul>{p.keptBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))}
        </>
      )}

      {visibleEdu.length > 0 && (
        <>
          <h2>Education</h2>
          {visibleEdu.map((ed, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <span style={{ fontWeight: 600 }}>{ed.institution}</span>
                {ed.degree && <span style={{ color: "#333" }}> · {ed.degree}</span>}
              </div>
              {ed.dates && <span className="pdf-dates">{ed.dates}</span>}
            </div>
          ))}
        </>
      )}

      {cv.skills_line && !skillsHidden && (
        <>
          <h2>Skills</h2>
          <div className="pdf-skills-line">{cv.skills_line}</div>
        </>
      )}

      {visibleCerts.length > 0 && (
        <>
          <h2>Certifications</h2>
          <ul>{visibleCerts.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}

      <div className="pdf-foot">
        <span>{contact.name} — tailored for {company}</span>
        <span>Generated via Myro · myro.app</span>
      </div>
    </div>
  )
}
