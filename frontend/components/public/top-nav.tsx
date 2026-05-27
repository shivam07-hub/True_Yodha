"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { MyroLogo } from "@/components/myro-logo"
import { getAccessToken } from "@/lib/session"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import "./public-nav.css"

export type PublicNavPage = "intel" | "newsletter" | "about" | "privacy" | "signup" | "login" | "docs"

interface PublicTopNavProps {
  active?: PublicNavPage
  showSignIn?: boolean
}

const STATIC_NAV_ITEMS: { label: string; href: string; id: PublicNavPage }[] = [
  { label: "CV Hub", href: "/about", id: "about" },
  { label: "How it works", href: "/docs", id: "docs" },
  { label: "Newsletter", href: "/newsletter", id: "newsletter" },
]

function formatTodayShort(): string {
  // Computed at every render — long-lived tabs that survive past midnight no
  // longer freeze on yesterday's date (beta-3 finding: Intel label stuck on
  // "24 May" the morning after).
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export function PublicTopNav({ active, showSignIn }: PublicTopNavProps) {
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
        {STATIC_NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="tm-public-nav-link"
            data-active={item.id === active}
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/intel"
          className="tm-public-nav-link"
          data-active={active === "intel"}
        >
          {intelLabel}
        </Link>
      </div>

      <div className="tm-public-nav-auth">
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
        {showSignIn && (
          <Link href="/login" className="tm-public-nav-signin">
            Sign in →
          </Link>
        )}
      </div>
    </nav>
  )
}
