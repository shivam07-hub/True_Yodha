"use client"

import { useQuery } from "@tanstack/react-query"
import { cv, type CVStructured } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { CvStructuredRecovery } from "@/components/cv/cv-structured-recovery"
import { Skeleton } from "@/components/ui/skeleton"

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

function FirstRunCvPaperSkeleton() {
  return (
    <div className="cvb-pgc-paper" aria-hidden="true">
      <div className="cvb-pgc-contact-card space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-56" />
      </div>
      {[0, 1, 2].map((block) => (
        <div key={block} className="cvb-pgc-role-block">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-[92%]" />
          <Skeleton className="mt-2 h-4 w-[70%]" />
        </div>
      ))}
    </div>
  )
}

export function FirstRunCvPane({ token }: { token: string }) {
  const structured = useQuery({
    queryKey: dataKeys.cvStructured(),
    queryFn: () => cv.structured(token),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })
  const ready = hasCvContent(structured.data)

  return (
    <section className="cvb-v2-editor" aria-label="Your CV" aria-busy={structured.isFetching && !ready}>
      <div className="cvb-v2-toolbar">
        <span className="cvb-v2-toolbar-label mono">Your Main CV</span>
      </div>
      <div className="cvb-v2-editorbody">
        {ready ? (
          <FirstRunCvPaper cv={structured.data} />
        ) : structured.isError ? (
          <CvStructuredRecovery
            isRetrying={structured.isFetching}
            onRetry={() => { void structured.refetch() }}
          />
        ) : (
          <FirstRunCvPaperSkeleton />
        )}
      </div>
    </section>
  )
}
