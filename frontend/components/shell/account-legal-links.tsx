"use client"

import Link from "next/link"

/**
 * AccountLegalLinks — the authed-shell utility cluster.
 *
 * Enterprise apps (Google, LinkedIn, X) don't paste a marketing footer into the
 * workspace; they tuck a quiet Help / Privacy / Terms / © cluster at the bottom
 * of the account menu. This is that cluster — the single authed home for the
 * legal + help obligations the public <PublicFooter> carries. Linking /privacy
 * and /terms also surfaces the IT-Rules grievance sections (privacy §11, terms
 * §08), closing the post-login grievance-reachability gap (CLAUDE.md #17)
 * without hardcoding a counsel-gated grievance contact.
 *
 * Shared by the desktop avatar menu (web-chrome) and the mobile profile sheet.
 * Pages open in a new tab so the locked app shell (100dvh, ADR-0010) isn't torn
 * down — matches the existing settings-modal legal links.
 */

const LINKS: { label: string; href: string; mailto?: boolean }[] = [
  { label: "Help",    href: "/docs"    },
  { label: "Contact", href: "mailto:hello@himyro.com", mailto: true },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms",   href: "/terms"   },
]

export function AccountLegalLinks() {
  return (
    <div
      aria-label="Legal and help"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 8px",
        padding: "10px 12px 4px",
        fontSize: 11,
        lineHeight: 1.5,
        color: "var(--tm-text-faint)",
      }}
    >
      {LINKS.map((l, i) => {
        const linkStyle = { color: "var(--tm-text-faint)", textDecoration: "none" }
        const onEnter = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = "var(--tm-interactive-rest)" }
        const onLeave = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = "var(--tm-text-faint)" }
        return (
          <span key={l.href} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            {i > 0 && <span aria-hidden="true">·</span>}
            {l.mailto ? (
              <a href={l.href} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {l.label}
              </a>
            ) : (
              <Link href={l.href} target="_blank" rel="noopener noreferrer" style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {l.label}
              </Link>
            )}
          </span>
        )
      })}
      <span aria-hidden="true">·</span>
      <span>© Myro 2026</span>
    </div>
  )
}
