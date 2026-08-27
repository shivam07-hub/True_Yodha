import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"

import type { SkillCertificatePublic } from "@/lib/career-skill-path"
import "./verify-skill.css"

interface Params {
  params: { id: string }
}

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_INTERNAL_URL ??
    ""
  )
}

async function fetchCertificate(id: string): Promise<SkillCertificatePublic | null> {
  const base = apiBase()
  if (!base || !id) return null
  const res = await fetch(`${base}/public/skill-certificates/${encodeURIComponent(id)}`, {
    cache: "no-store",
  })
  if (!res.ok) return null
  return (await res.json()) as SkillCertificatePublic
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const cert = await fetchCertificate(params.id)
  if (!cert) return { title: "Myro Skill Certificate" }
  return {
    title: `${cert.skill_display_name} · Level ${cert.achieved_level} · Myro Skill Certificate`,
    description: `Myro Skill Certificate for ${cert.skill_display_name}, level ${cert.achieved_level}. Not university, employer, or industry accreditation.`,
  }
}

export default async function VerifySkillPage({ params }: Params) {
  const cert = await fetchCertificate(params.id)
  if (!cert) notFound()
  const passed = cert.passed_at.slice(0, 10)
  return (
    <main className="vsk-page">
      <p className="vsk-kicker">Myro Skill Certificate</p>
      <h1 className="vsk-skill">{cert.skill_display_name}</h1>
      <p className="vsk-level">Skill level {cert.achieved_level}</p>
      <dl className="vsk-facts">
        <div>
          <dt>Passed</dt>
          <dd>{passed}</dd>
        </div>
        <div>
          <dt>Edition</dt>
          <dd>{cert.assessment_edition}</dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{cert.verification_id}</dd>
        </div>
      </dl>
      <p className="vsk-note">
        This is a Myro Skill Certificate. It is not university, employer, or industry accreditation.
      </p>
      <Link className="vsk-home" href="/">Myro</Link>
    </main>
  )
}
