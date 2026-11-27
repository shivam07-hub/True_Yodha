"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"
import { footerColumns } from "@/lib/site-routes"
import { useIsAndroidApp } from "@/lib/platform/use-android-app"
import { isSalePath } from "@/lib/sale"
import { LINKEDIN_PATH, SHIVAM_LINKEDIN_URL } from "./linkedin"
import "./public-footer.css"

// X and Instagram marks inlined (lucide has no reliable brand marks). 24×24 viewBox.
const SOCIALS = [
  {
    label: "Myro on X",
    href: "https://x.com/himyro",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "Myro on LinkedIn",
    href: "https://www.linkedin.com/company/himyro-career-intelligence/",
    path: LINKEDIN_PATH,
  },
  {
    label: "Myro on Instagram",
    href: "https://www.instagram.com/myrojobs/",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z",
  },
]

// Footer columns now derive from the single site-route registry (lib/site-routes)
// — add a public page there once and it appears here automatically.
const FOOTER_COLS = footerColumns()

// `commons` renders the "Open by default" transparency strip (the model chain).
// Intel-gated — only /intel passes it. Folds the old standalone <IntelCommons>
// section into the footer so the page ends in one band, not two grid-twin blocks.
export function PublicFooter({ commons = false }: { commons?: boolean } = {}) {
  const inApp = useIsAndroidApp()
  const columns = FOOTER_COLS.map((col) => ({
    ...col,
    links: inApp ? col.links.filter((link) => !isSalePath(link.href)) : col.links,
  }))
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div className="pub-footer-brand">
          <Link href="/" className="pub-footer-logo" aria-label="Myro home">
            <MyroLogo size={22} />
            <span className="pub-footer-wordmark">Myro</span>
          </Link>
          <p className="pub-footer-tagline">career intelligence</p>
          <p className="pub-footer-sub">
            Myro matches your CV to current openings and helps you tailor it for the job you choose.
          </p>
          <div className="pub-footer-social">
            {SOCIALS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="pub-footer-social-link"
                aria-label={s.label}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d={s.path} />
                </svg>
              </a>
            ))}
          </div>
          <a
            href={SHIVAM_LINKEDIN_URL}
            target="_blank"
            rel="noreferrer"
            className="pub-footer-founder"
            aria-label="Shivam Pathak, founder, on LinkedIn"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d={LINKEDIN_PATH} />
            </svg>
            <span className="pub-footer-founder-role">Founder</span>
            <span>Shivam Pathak</span>
          </a>
        </div>

        {columns.map((col) => (
          <div key={col.title} className="pub-footer-col">
            <div className="pub-footer-col-title">{col.title}</div>
            <ul className="pub-footer-links">
              {col.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="pub-footer-link"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {commons && (
        <div className="pub-footer-commons">
          <span className="pub-footer-commons-label">Open by default</span>
          <div className="pub-footer-commons-items">
            <span className="pub-footer-commons-item">
              <span className="pub-footer-commons-k">Model</span>
              <span className="pub-footer-commons-v">openrouter → groq → gemini</span>
            </span>
          </div>
          <div className="pub-footer-commons-links">
            <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="pub-footer-commons-link">
              Provider chain →
            </a>
          </div>
        </div>
      )}

      <div className="pub-footer-bottom">
        <span>© Myro 2026 · All rights reserved</span>
        <span className="pub-footer-bottom-dot">·</span>
        <span>Built for Seekers</span>
        <span className="pub-footer-bottom-dot">·</span>
        <span>Made with ❤️ in India</span>
        <span className="pub-footer-bottom-dot">·</span>
        <Link className="pub-footer-trust" href="/security">Security →</Link>
      </div>
    </footer>
  )
}
