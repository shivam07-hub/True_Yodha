"use client"

import { useQuery } from "@tanstack/react-query"
import { cv, type CVStructured } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

function hasCvContent(value: CVStructured | null | undefined): value is CVStructured {
  if (!value) return false
  return Boolean(
    value.summary?.trim()
    || value.skills_line?.trim()
    || (value.experience ?? []).length
    || (value.projects ?? []).length
    || (value.education ?? []).length
    || (value.certs ?? []).length,
  )
}

function latestBaseline(versions: { kind: string; user_version_number: number; cv_structured?: CVStructured | null }[]) {
  return versions
    .filter((version) => version.kind === "baseline_upload")
    .reduce<(typeof versions)[number] | null>(
      (best, version) => (
        best == null || version.user_version_number > best.user_version_number ? version : best
      ),
      null,
    )
}

export function FirstRunCvPaper({ cv: raw }: { cv: CVStructured }) {
  const experience = raw.experience ?? []
  const projects = raw.projects ?? []
  const education = raw.education ?? []
  const certs = raw.certs ?? []
  const contact = raw.contact
  const name = contact?.name?.trim() || "Your name"
  const title = contact?.title?.trim() || experience[0]?.role || ""
  const meta = [contact?.email, contact?.phone, contact?.location, contact?.linkedin]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="cvb-pgc-paper">
      <div className="cvb-pgc-contact-card">
        <div className="cvb-pgc-name">{name}</div>
        {title ? <div className="cvb-pgc-role">{title}</div> : null}
        {meta ? <div className="cvb-pgc-contact mono">{meta}</div> : null}
      </div>

      {raw.summary ? (
        <>
          <div className="cvb-pgc-section">SUMMARY</div>
          <p className="text-pretty text-sm leading-6 text-[var(--tm-text)]">{raw.summary}</p>
        </>
      ) : null}

      {experience.length > 0 ? <div className="cvb-pgc-section">EXPERIENCE</div> : null}
      {experience.map((role, index) => (
        <div key={`exp-${index}`} className="cvb-pgc-role-block">
          <div className="cvb-pgc-role-head">
            <span className="cvb-pgc-role-title">
              {role.role}
              {role.company ? <span> · {role.company}</span> : null}
            </span>
            {role.dates ? <span className="mono cvb-pgc-role-dates">{role.dates}</span> : null}
          </div>
          {(role.bullets ?? []).map((bullet, bulletIndex) => (
            <p key={`${index}-${bulletIndex}`} className="mt-2 text-pretty text-sm leading-6 text-[var(--tm-text)]">{bullet}</p>
          ))}
        </div>
      ))}

      {projects.length > 0 ? <div className="cvb-pgc-section">PROJECTS</div> : null}
      {projects.map((project, index) => (
        <div key={`proj-${index}`} className="cvb-pgc-role-block">
          <div className="cvb-pgc-role-head">
            <span className="cvb-pgc-role-title">{project.name}</span>
            {project.dates ? <span className="mono cvb-pgc-role-dates">{project.dates}</span> : null}
          </div>
          {(project.bullets ?? []).map((bullet, bulletIndex) => (
            <p key={`${index}-${bulletIndex}`} className="mt-2 text-pretty text-sm leading-6 text-[var(--tm-text)]">{bullet}</p>
          ))}
        </div>
      ))}

      {education.length > 0 ? <div className="cvb-pgc-section">EDUCATION</div> : null}
      {education.map((item, index) => (
        <div key={`edu-${index}`} className="cvb-pgc-role-block">
          <div className="cvb-pgc-role-head">
            <span className="cvb-pgc-role-title">
              {item.institution}
              {item.degree ? <span> · {item.degree}</span> : null}
            </span>
            {item.dates ? <span className="mono cvb-pgc-role-dates">{item.dates}</span> : null}
          </div>
        </div>
      ))}

      {raw.skills_line ? (
        <>
          <div className="cvb-pgc-section">SKILLS</div>
          <p className="text-pretty text-sm leading-6 text-[var(--tm-text)]">{raw.skills_line}</p>
        </>
      ) : null}

      {certs.length > 0 ? <div className="cvb-pgc-section">CERTIFICATIONS</div> : null}
      {certs.map((cert) => (
        <div key={cert} className="cvb-pgc-role-block">
          <div className="cvb-pgc-role-head">
            <span className="cvb-pgc-role-title">{cert}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function FirstRunCvPane({ token }: { token: string }) {
  const versions = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cv.versions.list(token),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const baseline = latestBaseline(query.state.data?.versions ?? [])
      return hasCvContent(baseline?.cv_structured ?? null) ? false : 2_500
    },
  })
  const structured = latestBaseline(versions.data?.versions ?? [])?.cv_structured
  const ready = hasCvContent(structured)

  return (
    <section className="cvb-v2-editor" aria-label="Your CV">
      <div className="cvb-v2-toolbar">
        <span className="cvb-v2-toolbar-label mono">Your Main CV</span>
      </div>
      <div className="cvb-v2-editorbody">
        {ready ? (
          <FirstRunCvPaper cv={structured} />
        ) : (
          <div className="cvb-pgc-paper">
            <div className="cvb-pgc-contact-card">
              <p className="cvb-v2-rail-lede">
                {versions.isError
                  ? "The document view is still catching up. Confirm the skills on the right — your CV is saved."
                  : "Laying out your CV… You can confirm skills now."}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
