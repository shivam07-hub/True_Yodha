"use client"

import Link from "next/link"
import { type ReactNode } from "react"
import { Mail, GraduationCap } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { ThemeControl } from "@/components/ui/theme-control"
import { useSession } from "@/lib/hooks/use-auth"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { AuthedTopStripStandalone } from "@/components/shell/authed-top-strip"
import { navMarketingRoutes } from "@/lib/site-routes"
import "./public-nav.css"

export type PublicNavPage = "intel" | "newsletter" | "home" | "privacy" | "signup" | "login" | "docs" | "institutions"

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
//
// The marketing items now DERIVE from the single site-route registry
// (lib/site-routes): declare a public surface with `nav: {treatment: "mail"|
// "grad"}` there and it appears here — no parallel list to forget. The /intel
// "live" treatment is the special live-pill below, not this glyph list.
const NAV_ICON: Record<"mail" | "grad", typeof Mail> = { mail: Mail, grad: GraduationCap }

const STATIC_NAV_ITEMS: {
  label: string
  href: string
  id: PublicNavPage
  accent?: boolean
  Icon: typeof Mail
}[] = navMarketingRoutes()
  .filter((r) => r.nav.treatment === "mail" || r.nav.treatment === "grad")
  .map((r) => ({
    label: r.label,
    href: r.path,
    id: r.nav.id as PublicNavPage,
    Icon: NAV_ICON[r.nav.treatment as "mail" | "grad"],
  }))

export function PublicTopNav({ active, showSignIn, authSlot }: PublicTopNavProps) {
  // Passive session read — useSession NEVER redirects (useAuth does), so a
  // logged-out visitor stays on the marketing page. All hooks stay top-level so
  // the branch below can't change hook order.
  const { token } = useSession()
  const signup = useSignupGate()

  // One app: a signed-in visitor on any public surface (newsletter / intel /
  // institutions) gets the EXACT app strip — the same <AuthedTopStrip> the app
  // shell mounts. No parallel authed bar to drift, no "Go to app →" (they're
  // already in the app), no identity chrome vanishing. Logged-out visitors keep
  // the marketing bar below.
  if (token) return <AuthedTopStripStandalone />

  return (
    <nav aria-label="Public navigation" className="tm-public-nav">
      <Link href="/" aria-label="Myro home" className="tm-public-nav-brand">
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
          <span className="tm-public-nav-label">Live Job Data</span>
        </Link>
      </div>

      <div className="tm-public-nav-auth">
        {/* Public surface (light/dark) switch — reverses the pre-login
            "follow-OS only" rule so visitors read in their preferred brand.
            Authed visitors get the toggle inside the account menu instead. */}
        <ThemeControl className="tm-public-nav-theme" />
        {showSignIn && (
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
          <Link
            href="/signup"
            className="tm-public-nav-signup"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
              e.preventDefault()
              signup.open({ surface: "manual", source: "public_nav_signup_pill" })
            }}
          >
            Sign up
          </Link>
        )}
      </div>
    </nav>
  )
}
