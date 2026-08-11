import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"

/**
 * Company pages (/companies/[slug]) are a dual-audience surface: a public SEO
 * landing AND a destination authed users reach from Intel/market company links.
 * They had NO layout, so they inherited only the bare root shell — a logged-in
 * user lost the entire app frame on arrival (experience-continuity break).
 *
 * Mounting the shared PublicTopNav (same as /newsletter) fixes both audiences at
 * once: it adapts itself — anonymous visitors get the marketing bar + Sign up,
 * logged-in users get their workspace tabs + "Go to app". One nav, no drift.
 */
export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <PublicTopNav showSignIn />
      <main style={{ flex: 1 }}>{children}</main>
      <PublicFooter />
    </div>
  )
}
