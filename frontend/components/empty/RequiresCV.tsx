"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { MyroLogo } from "@/components/myro-logo"
import { users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import "./requires-cv.css"

interface RequiresCVProps {
  children: ReactNode
  surface?: "skills" | "forge" | "home" | "generic"
}

/**
 * Boundary primitive that gates personal-CV surfaces behind a parsed CV.
 *
 * Decision context: Ousterhout audit 2026-05-23. The "user needs a CV first"
 * precondition leaked across at least 6 surfaces (Forge, Skills, Intel, Tracker,
 * Home, Market) each with its own ad-hoc empty state. This boundary collapses
 * those into one canonical pre-CV invitation.
 *
 * Signal: `users.me().has_cv` — backend derives this from cv_versions
 * (any row with kind='baseline_upload'). The original `cv_parsed_at`
 * column was dropped in 20260518_cv_versions_unify; reading the dead
 * field silently blocked every CV-uploaded user on Forge / Skills.
 * Uses the same `dataKeys.profile()` key every authed page shares, so
 * the gate decision comes from cache on warm pages.
 */
type CVReadiness = "ready" | "missing" | "processing" | "failed"

interface EmptyCopy {
  heading: string
  body: string
  ctaLabel: string
  ctaHref: string
  secondaryLabel?: string
  secondaryHref?: string
  statusLabel?: string
}

function copyFor(surface: RequiresCVProps["surface"], readiness: CVReadiness): EmptyCopy {
  const s = surface ?? "generic"
  if (s === "skills") {
    if (readiness === "processing") {
      return {
        heading: "Building your Skill Intelligence map",
        body: "Your CV is still being analyzed. Once parsing completes, this page will show your domain gaps and progression plan.",
        ctaLabel: "Check CV status",
        ctaHref: "/cv",
        secondaryLabel: "Explore market demand",
        secondaryHref: "/market",
        statusLabel: "CV analysis in progress",
      }
    }
    if (readiness === "failed") {
      return {
        heading: "Skill Intelligence setup needs retry",
        body: "Your last CV analysis did not complete. Re-upload your CV to unlock your domain map and skill recommendations.",
        ctaLabel: "Retry CV upload",
        ctaHref: "/cv?upload=1",
        secondaryLabel: "See how scoring works",
        secondaryHref: "/about",
        statusLabel: "Last analysis failed",
      }
    }
    return {
      heading: "Skill Intelligence starts with your CV",
      body: "Upload your baseline CV once to unlock domain scoring, gap detection, and skill-by-skill progression insights.",
      ctaLabel: "Upload CV to unlock Skills",
      ctaHref: "/cv?upload=1",
      secondaryLabel: "See the product flow",
      secondaryHref: "/about",
      statusLabel: "CV required",
    }
  }

  return {
    heading: "Start your CV hub",
    body: "Upload your master CV. Tailor a version for every job you target. See each one scored.",
    ctaLabel: "Upload your CV",
    ctaHref: "/cv?upload=1",
  }
}

export function RequiresCV({ children, surface = "generic" }: RequiresCVProps) {
  const { token, ready } = useAuth()
  const profileQuery = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!ready && !!token,
    staleTime: 5 * 60 * 1000,
  })

  if (!ready || !token) return null
  if (profileQuery.isLoading) return null

  const hasCV = !!profileQuery.data?.has_cv
  const readiness: CVReadiness = hasCV ? "ready" : (profileQuery.data?.cv_readiness ?? "missing")
  if (hasCV) return <>{children}</>

  return <CVRequiredEmpty surface={surface} readiness={readiness} />
}

const SKILLS_TEASER_DOMAINS = [
  "Tech",
  "Engineering",
  "Growth",
  "Sales",
  "Finance",
  "People",
  "Design",
  "Law",
  "Research",
  "Health",
]

function CVRequiredEmpty({ surface, readiness }: { surface: RequiresCVProps["surface"]; readiness: CVReadiness }) {
  const copy = copyFor(surface, readiness)
  const showSkillsTeaser = surface === "skills" && readiness !== "processing"
  return (
    <div className="tm-requires-cv">
      <div className="tm-requires-cv-logo">
        <MyroLogo size={56} />
      </div>
      {copy.statusLabel ? <div className="tm-requires-cv-status">{copy.statusLabel}</div> : null}
      <h2 className="tm-requires-cv-heading">{copy.heading}</h2>
      <p className="tm-requires-cv-body">{copy.body}</p>
      {showSkillsTeaser ? (
        <div className="tm-requires-cv-teaser" aria-hidden>
          {SKILLS_TEASER_DOMAINS.map((d) => (
            <span key={d} className="tm-requires-cv-teaser-tile">{d}</span>
          ))}
        </div>
      ) : null}
      <Link href={copy.ctaHref} className="tm-requires-cv-cta">
        {copy.ctaLabel}
        <span aria-hidden>→</span>
      </Link>
      {copy.secondaryHref && copy.secondaryLabel ? (
        <Link href={copy.secondaryHref} className="tm-requires-cv-secondary">
          {copy.secondaryLabel}
        </Link>
      ) : null}
    </div>
  )
}
