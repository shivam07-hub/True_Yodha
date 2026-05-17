"use client"

import { useMemo } from "react"
import type { CVStructured, SkillGapItem } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"

interface CVPlaygroundProps {
  cv: CVStructured
  hiddenItems: Set<string>
  onToggle: (itemId: string) => void
  targetSkills: SkillGapItem[]            // from /jobs/{jobId}/skill-gap
  jobTitle?: string
  companyName?: string
}

/** Lowercase substring match — returns the names of target skills found in this bullet. */
function matchesFor(bullet: string, targets: SkillGapItem[]): SkillGapItem[] {
  const lower = bullet.toLowerCase()
  return targets.filter(t => {
    const name = t.skill.toLowerCase()
    if (!name) return false
    // Try word-bounded match first for short skill names to avoid false positives.
    return lower.includes(name)
  })
}

function EyeToggle({ visible, onClick, ariaLabel }: { visible: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      title={visible ? "Hide this item" : "Show this item"}
      style={{
        width: 22, height: 22,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 99, border: "none", background: "transparent",
        color: visible ? "var(--tm-success)" : "var(--tm-text-faint)",
        cursor: "pointer", flexShrink: 0,
        opacity: visible ? 1 : 0.55,
        transition: "all 150ms var(--tm-ease)",
      }}
    >
      {visible ? "👁" : "🚫"}
    </button>
  )
}

function MatchBadge({ matches }: { matches: SkillGapItem[] }) {
  if (!matches.length) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 10, color: "var(--tm-text-faint)",
        padding: "2px 8px", borderRadius: 99,
        border: "1px solid var(--tm-border-soft)", background: "transparent",
      }}>○ no target match</span>
    )
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 10, color: "var(--tm-success)",
      padding: "2px 8px", borderRadius: 99,
      border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.06)",
    }}>
      🟢 {matches.slice(0, 3).map(m => m.skill).join(" · ")}
      {matches.length > 3 ? ` +${matches.length - 3}` : ""}
    </span>
  )
}

function SectionShell({ title, count, total, children, headerExtra }: {
  title: string
  count?: number
  total?: number
  children: React.ReactNode
  headerExtra?: React.ReactNode
}) {
  return (
    <div style={{
      border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)",
      background: "var(--tm-surface)", overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)",
      }}>
        <div className="tm-label-caps" style={{ letterSpacing: "0.1em" }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {count !== undefined && total !== undefined && (
            <span style={{ fontSize: 10, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)" }}>
              {count} / {total} visible
            </span>
          )}
          {headerExtra}
        </div>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  )
}

function BulletRow({
  bullet, hidden, onToggle, matches,
}: {
  bullet: string
  hidden: boolean
  onToggle: () => void
  matches: SkillGapItem[]
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start",
      padding: "8px 0", borderBottom: "1px dashed var(--tm-border-soft)",
      opacity: hidden ? 0.4 : 1,
      transition: "opacity 200ms var(--tm-ease)",
    }}>
      <EyeToggle visible={!hidden} onClick={onToggle} ariaLabel="toggle bullet" />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontSize: 13, color: "var(--tm-text)", lineHeight: 1.55,
          textDecoration: hidden ? "line-through" : "none",
        }}>{bullet}</div>
        <MatchBadge matches={matches} />
      </div>
    </div>
  )
}

export function CVPlayground({ cv, hiddenItems, onToggle, targetSkills, jobTitle, companyName }: CVPlaygroundProps) {
  const items = useMemo(() => ({
    summary: cv.summary,
    experience: cv.experience,
    projects: cv.projects,
    education: cv.education,
    skillsLine: cv.skills_line,
    certs: cv.certs,
  }), [cv])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(jobTitle || companyName) && (
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
          Tailoring for <span style={{ color: "var(--tm-accent)" }}>{jobTitle ?? "this role"}</span>
          {companyName ? <> · {companyName}</> : null}
        </div>
      )}

      {/* SUMMARY — section-level toggle */}
      {items.summary && (
        <SectionShell
          title="Summary"
          headerExtra={
            <EyeToggle
              visible={!hiddenItems.has(itemId("summary", 0, items.summary))}
              onClick={() => onToggle(itemId("summary", 0, items.summary!))}
              ariaLabel="toggle summary"
            />
          }
        >
          <p style={{
            margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--tm-text-muted)",
            opacity: hiddenItems.has(itemId("summary", 0, items.summary)) ? 0.4 : 1,
            textDecoration: hiddenItems.has(itemId("summary", 0, items.summary)) ? "line-through" : "none",
          }}>{items.summary}</p>
        </SectionShell>
      )}

      {/* EXPERIENCE — bullet-level */}
      {items.experience.length > 0 && (() => {
        const total = items.experience.reduce((n, e) => n + e.bullets.length, 0)
        const visible = items.experience.reduce((n, e, i) =>
          n + e.bullets.filter((b, j) => !hiddenItems.has(itemId("exp_bullet", i * 100 + j, b))).length, 0)
        return (
          <SectionShell title="Experience" count={visible} total={total}>
            {items.experience.map((exp, i) => (
              <div key={`${exp.company}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: "var(--tm-text)",
                  marginTop: i === 0 ? 0 : 8,
                }}>
                  {exp.role}{exp.company ? ` · ${exp.company}` : ""}
                  {exp.dates ? <span style={{ color: "var(--tm-text-faint)", fontWeight: 400, marginLeft: 8 }}>{exp.dates}</span> : null}
                </div>
                {exp.bullets.map((bullet, j) => {
                  const iid = itemId("exp_bullet", i * 100 + j, bullet)
                  return (
                    <BulletRow
                      key={iid}
                      bullet={bullet}
                      hidden={hiddenItems.has(iid)}
                      onToggle={() => onToggle(iid)}
                      matches={matchesFor(bullet, targetSkills)}
                    />
                  )
                })}
              </div>
            ))}
          </SectionShell>
        )
      })()}

      {/* PROJECTS — bullet-level */}
      {items.projects.length > 0 && (() => {
        const total = items.projects.reduce((n, p) => n + p.bullets.length, 0)
        const visible = items.projects.reduce((n, p, i) =>
          n + p.bullets.filter((b, j) => !hiddenItems.has(itemId("proj_bullet", i * 100 + j, b))).length, 0)
        return (
          <SectionShell title="Projects" count={visible} total={total}>
            {items.projects.map((proj, i) => (
              <div key={`${proj.name}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tm-text)", marginTop: i === 0 ? 0 : 8 }}>
                  {proj.name}
                  {proj.dates ? <span style={{ color: "var(--tm-text-faint)", fontWeight: 400, marginLeft: 8 }}>{proj.dates}</span> : null}
                </div>
                {proj.bullets.map((bullet, j) => {
                  const iid = itemId("proj_bullet", i * 100 + j, bullet)
                  return (
                    <BulletRow
                      key={iid}
                      bullet={bullet}
                      hidden={hiddenItems.has(iid)}
                      onToggle={() => onToggle(iid)}
                      matches={matchesFor(bullet, targetSkills)}
                    />
                  )
                })}
              </div>
            ))}
          </SectionShell>
        )
      })()}

      {/* SKILLS — per-skill chip toggle */}
      {items.skillsLine && (
        <SectionShell
          title="Skills line"
          headerExtra={
            <EyeToggle
              visible={!hiddenItems.has(itemId("skills_line", 0, items.skillsLine))}
              onClick={() => onToggle(itemId("skills_line", 0, items.skillsLine!))}
              ariaLabel="toggle skills line"
            />
          }
        >
          <div style={{
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
            opacity: hiddenItems.has(itemId("skills_line", 0, items.skillsLine)) ? 0.4 : 1,
            textDecoration: hiddenItems.has(itemId("skills_line", 0, items.skillsLine)) ? "line-through" : "none",
          }}>{items.skillsLine}</div>
        </SectionShell>
      )}

      {/* EDUCATION — section-level toggle (each row) */}
      {items.education.length > 0 && (
        <SectionShell title="Education">
          {items.education.map((edu, i) => {
            const line = [edu.institution, edu.degree, edu.dates].filter(Boolean).join(" · ")
            const iid = itemId("edu", i, line)
            const hidden = hiddenItems.has(iid)
            return (
              <div key={iid} style={{
                display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center",
                opacity: hidden ? 0.4 : 1, padding: "4px 0",
              }}>
                <EyeToggle visible={!hidden} onClick={() => onToggle(iid)} ariaLabel="toggle education row" />
                <div style={{
                  fontSize: 12, color: "var(--tm-text)",
                  textDecoration: hidden ? "line-through" : "none",
                }}>
                  {line}{edu.grade ? <span style={{ color: "var(--tm-text-faint)" }}> · {edu.grade}</span> : null}
                </div>
              </div>
            )
          })}
        </SectionShell>
      )}

      {/* CERTIFICATIONS */}
      {items.certs.length > 0 && (
        <SectionShell title="Certifications">
          {items.certs.map((cert, i) => {
            const iid = itemId("cert", i, cert)
            const hidden = hiddenItems.has(iid)
            return (
              <div key={iid} style={{
                display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center",
                opacity: hidden ? 0.4 : 1, padding: "4px 0",
              }}>
                <EyeToggle visible={!hidden} onClick={() => onToggle(iid)} ariaLabel="toggle certification" />
                <div style={{
                  fontSize: 12, color: "var(--tm-text)",
                  textDecoration: hidden ? "line-through" : "none",
                }}>{cert}</div>
              </div>
            )
          })}
        </SectionShell>
      )}
    </div>
  )
}
