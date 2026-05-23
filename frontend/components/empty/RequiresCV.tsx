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
}

/**
 * Boundary primitive that gates personal-CV surfaces behind a parsed CV.
 *
 * Decision context: Ousterhout audit 2026-05-23. The "user needs a CV first"
 * precondition leaked across at least 6 surfaces (Forge, Skills, Intel, Tracker,
 * Home, Market) each with its own ad-hoc empty state. This boundary collapses
 * those into one canonical pre-CV invitation.
 *
 * Signal: `users.me().cv_parsed_at` non-null = user has a usable parsed CV.
 * Uses the same `dataKeys.profile()` key every authed page shares, so the
 * gate decision comes from cache on warm pages.
 */
export function RequiresCV({ children }: RequiresCVProps) {
  const { token, ready } = useAuth()
  const profileQuery = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!ready && !!token,
    staleTime: 5 * 60 * 1000,
  })

  if (!ready || !token) return null
  if (profileQuery.isLoading) return null

  const hasCV = !!profileQuery.data?.cv_parsed_at
  if (hasCV) return <>{children}</>

  return <CVRequiredEmpty />
}

function CVRequiredEmpty() {
  return (
    <div className="tm-requires-cv">
      <div className="tm-requires-cv-logo">
        <MyroLogo size={56} />
      </div>
      <h2 className="tm-requires-cv-heading">Start your CV hub</h2>
      <p className="tm-requires-cv-body">
        Upload your master CV. Tailor a version for every job you target. See each one scored.
      </p>
      <Link href="/cv?upload=1" className="tm-requires-cv-cta">
        Upload your CV
        <span aria-hidden>→</span>
      </Link>
    </div>
  )
}
