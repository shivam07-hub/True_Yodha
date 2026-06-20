"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { Mail, GraduationCap } from "lucide-react"
import { MyroLogo } from "@/components/myro-logo"
import { ThemeControl } from "@/components/ui/theme-control"
import { getAccessToken } from "@/lib/session"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
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

export function PublicTopNav({ active, showSignIn, authSlot }: PublicTopNavProps) {
  const [isAuthed, setIsAuthed] = useState(false)
  const signup = useSignupGate()

  // Continuous-nav fix: a logged-in viewer on a public surface (newsletter /
  // intel / institutions) must not "fall out" of the app — the workspace tabs
  // have to follow them across the public/authed layout boundary. Reuse the SAME
  // useNavUnlocks seam the authed shell consumes so the gate (Jobs+Dashboard
  // always, CV on baseline, Myrology on opt-in) is decided once and never drifts
  // between the two navs. Queries are token-gated and React-Query-deduped, so on
  // a logged-out visit this is inert (no fetch) and renders nothing extra.
  const nav = useNavUnlocks()

  useEffect(() => {
    setIsAuthed(!!getAccessToken())
  }, [])

  // Single ordered source (no parallel nav): an authed viewer's public bar
  // renders the SAME shared clusters in the SAME order as the app shell
  // (web-chrome) — content cluster (Intel / Newsletter / Myrology, nav.content)
  // first, then workspace tabs (Jobs / Dashboard / CV, nav.visibleDesktop). Both
  // bars consume useNavUnlocks, so order and labels can't drift between them.
  // Logged-out visitors get the marketing items (Newsletter, For Colleges) +
  // the Live Job Data CTA instead; the logo routes an authed viewer to the app.

  return (
    <nav aria-label="Public navigation" className="tm-public-nav">
      <Link
        href={isAuthed ? "/home" : "/"}
        aria-label={isAuthed ? "Myro — back to app" : "Myro home"}
        className="tm-public-nav-brand"
      >
        <MyroLogo size={34} />
        <span className="tm-public-nav-wordmark">Myro</span>
      </Link>

      <div className="tm-public-nav-links">
        {isAuthed ? (
          <>
            {/* Content cluster — Intel / Newsletter / Myrology — identical order
                and labels to the app shell's NavContentCluster (nav.content). */}
            {nav.content.length > 0 && (
              <div className="tm-public-nav-content">
                {nav.content.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`tm-public-nav-link${item.special ? " tm-public-nav-link-accent" : ""}`}
                    data-active={item.id === active}
                    title={item.desc}
                  >
                    <span className="tm-public-nav-label">
                      {item.special ? `✦ ${item.label}` : item.label}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {/* Workspace tabs — Jobs / Dashboard / CV — follow the content
                cluster, mirroring web-chrome (TopbarNav after NavContentCluster). */}
            {nav.visibleDesktop.length > 0 && (
              <div className="tm-public-nav-workspace">
                {nav.visibleDesktop.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="tm-public-nav-link"
                    data-active={item.id === active}
                    title={item.desc}
                  >
                    <span className="tm-public-nav-label">{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="tm-public-nav-auth">
        {/* Public surface (light/dark) switch — reverses the pre-login
            "follow-OS only" rule so visitors read in their preferred brand.
            Same canonical primitive as the authed account dropdown. */}
        <ThemeControl className="tm-public-nav-theme" />
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
