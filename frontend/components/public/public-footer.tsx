"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"
import "./public-footer.css"

// Brand glyphs inlined (lucide has no reliable X/GitHub brand marks). 24×24 viewBox.
const SOCIALS = [
  {
    label: "Myro on X",
    href: "https://x.com/himyro",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "Myro on LinkedIn",
    href: "https://www.linkedin.com/company/himyro-career-intelligence/",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "Myro on GitHub",
    href: "https://github.com/shivam07-hub/True_Yodha",
    path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  },
]

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { label: "CV Hub",        href: "/cv-preview"   },
      { label: "Live Job Data", href: "/intel"        },
      { label: "For Colleges",  href: "/institutions" },
      { label: "Myrology",      href: "/myrology"     },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Newsletter",     href: "/newsletter" },
      { label: "How it works",   href: "/docs"       },
      { label: "Skill Taxonomy", href: "/taxonomy"   },
      { label: "FAQ",            href: "/docs#faq"   },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Use",   href: "/terms"   },
    ],
  },
]

const GITHUB_URL = "https://github.com/shivam07-hub/True_Yodha"

// `commons` renders the "Open by default" transparency strip (model chain +
// license + privacy). Intel-gated — only /intel passes it. Folds the old
// standalone <IntelCommons> section into the footer so the page ends in one
// band, not two grid-twin blocks.
export function PublicFooter({ commons = false }: { commons?: boolean } = {}) {
  return (
    <footer className="pub-footer">
      {commons && (
        <div className="pub-footer-commons">
          <span className="pub-footer-commons-label">Open by default</span>
          <div className="pub-footer-commons-items">
            <span className="pub-footer-commons-item">
              <span className="pub-footer-commons-k">Model</span>
              <span className="pub-footer-commons-v">openrouter → groq → gemini</span>
            </span>
            <span className="pub-footer-commons-item">
              <span className="pub-footer-commons-k">License</span>
              <span className="pub-footer-commons-v">MIT · fork freely</span>
            </span>
            <span className="pub-footer-commons-item">
              <span className="pub-footer-commons-k">Privacy</span>
              <span className="pub-footer-commons-v">PV1 · CV never public</span>
            </span>
          </div>
          <div className="pub-footer-commons-links">
            <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="pub-footer-commons-link">
              Provider chain →
            </a>
            <a href={`${GITHUB_URL}/blob/Develop/LICENSE`} target="_blank" rel="noreferrer" className="pub-footer-commons-link">
              Read terms →
            </a>
          </div>
        </div>
      )}

      <div className="pub-footer-inner">
        <div className="pub-footer-brand">
          <Link href="/" className="pub-footer-logo" aria-label="Myro home">
            <MyroLogo size={22} />
            <span className="pub-footer-wordmark">Myro</span>
          </Link>
          <p className="pub-footer-tagline">career intelligence</p>
          <p className="pub-footer-sub">
            Myro — the Career Intelligence Platform. One engine: live job data in, scored and tailored CVs out.
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
        </div>

        {FOOTER_COLS.map((col) => (
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

      <div className="pub-footer-bottom">
        <span>© Myro 2026 · All rights reserved</span>
        <span className="pub-footer-bottom-dot">·</span>
        <span>Built for Seekers</span>
        <span className="pub-footer-bottom-dot">·</span>
        <span className="pub-footer-trust">
          SOC 2-certified infrastructure (Supabase · Vercel · Railway) · TLS in transit · Row-level security
        </span>
      </div>
    </footer>
  )
}
