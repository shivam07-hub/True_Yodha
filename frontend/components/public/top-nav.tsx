"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { Mail, GraduationCap } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { getAccessToken } from "@/lib/session"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import "./public-nav.css"

export type PublicNavPage = "intel" | "newsletter" | "about" | "privacy" | "signup" | "login" | "docs" | "institutions"

interface PublicTopNavProps {
  active?: PublicNavPage
  showSignIn?: boolean
  /**
   * Replaces the right-side primary CTA (Sign up / Go to app) with a custom
   * node. Sole sanctioned per-surface variation in the public nav — /institutions
   * passes its operators↔institutions mode toggle here so the rest of the bar
   * stays byte-identical to the homepage (no parallel nav).
   */
  authSlot?: ReactNode
}

// The Myro logo is the sole home affordance (LinkedIn/X pattern). The old
// "CV Hub" pill pointed at the landing too — a redundant second home link that
// also mislabelled the whole-platform landing as a single surface. Dropped.
const STATIC_NAV_ITEMS: {
  label: string
  href: string
  id: PublicNavPage
  accent?: boolean
  Icon: typeof Mail
}[] = [
  { label: "Newsletter",   href: "/newsletter",   id: "newsletter",   Icon: Mail          },
  { label: "For Colleges", href: "/institutions", id: "institutions", Icon: GraduationCap },
]

function formatTodayShort(): string {
  // Computed at every render — long-lived tabs that survive past midnight no
  // longer freeze on yesterday's date (beta-3 finding: Intel label stuck on
  // "24 May" the morning after).
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export function PublicTopNav({ active, showSignIn, authSlot }: PublicTopNavProps) {
  const [isAuthed, setIsAuthed] = useState(false)
  const signup = useSignupGate()

  useEffect(() => {
    setIsAuthed(!!getAccessToken())
  }, [])

  const intelLabel = isAuthed ? `Live Job Data · ${formatTodayShort()}` : "Live Job Data"

  return (
    <nav aria-label="Public navigation" className="tm-public-nav">
      <Link href="/about" aria-label="Myro home" className="tm-public-nav-brand">
        <MyroLogo size={34} />
        <span className="tm-public-nav-wordmark">Myro</span>
      </Link>

      <div className="tm-public-nav-links">
        {STATIC_NAV_ITEMS.map(({ Icon, ...item }) => (
          <Link
            key={item.id}
            href={item.href}
            className={`tm-public-nav-link${item.accent ? " tm-public-nav-link-accent" : ""}`}
            data-active={item.id === active}
            title={item.label}
          >
            <Icon className="tm-public-nav-glyph" size={18} aria-hidden="true" />
            <span className="tm-public-nav-label">{item.label}</span>
          </Link>
        ))}
        <Link
          href="/intel"
          className="tm-public-nav-link tm-public-nav-link-live"
          data-active={active === "intel"}
          title="Live Job Data"
        >
          <span className="tm-public-nav-livedot" aria-hidden="true" />
          <span className="tm-public-nav-label">{intelLabel}</span>
        </Link>
      </div>

      <div className="tm-public-nav-auth">
        {showSignIn && !isAuthed && (
          <Link
            href="/login"
            className="tm-public-nav-signin"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
              e.preventDefault()
              signup.open({ surface: "manual", mode: "login", source: "public_nav_signin" })
            }}
          >
            Sign in →
          </Link>
        )}
        {authSlot ?? (
          <>
            {!isAuthed && (
              <Link
                href="/signup"
                className="tm-public-nav-signup"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
                  e.preventDefault()
                  signup.open({ surface: "manual", next: "/cv?upload=1", source: "public_nav_signup_pill" })
                }}
              >
                Sign up
              </Link>
            )}
            {isAuthed && (
              <Link href="/home" className="tm-public-nav-signup">
                Go to app →
              </Link>
            )}
          </>
        )}
      </div>
    </nav>
  )
}
