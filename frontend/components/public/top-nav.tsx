"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"
import "./public-nav.css"

export type PublicNavPage = "intel" | "newsletter" | "about" | "privacy" | "signup" | "login"

interface PublicTopNavProps {
  active?: PublicNavPage
  showSignIn?: boolean
}

const NAV_ITEMS: { label: string; href: string; id: PublicNavPage }[] = [
  { label: "About", href: "/about", id: "about" },
  { label: "Newsletter", href: "/newsletter", id: "newsletter" },
  { label: "Intel", href: "/intel", id: "intel" },
]

export function PublicTopNav({ active, showSignIn }: PublicTopNavProps) {
  return (
    <nav aria-label="Public navigation" className="tm-public-nav">
      <Link href="/about" aria-label="Myro home" className="tm-public-nav-brand">
        <MyroLogo size={34} />
        <span className="tm-public-nav-wordmark">Myro</span>
      </Link>

      <div className="tm-public-nav-links">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="tm-public-nav-link"
            data-active={item.id === active}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="tm-public-nav-auth">
        <Link href="/signup" className="tm-public-nav-signup">
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
