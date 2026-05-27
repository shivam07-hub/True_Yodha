"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"
import "./public-footer.css"

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { label: "CV Hub",        href: "/about"      },
      { label: "Live Job Data", href: "/intel"      },
      { label: "Tracker",       href: "/about"      },
      { label: "Myrology ✦",   href: "/myrology",   accent: true },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "How it works", href: "/docs"       },
      { label: "Newsletter",   href: "/newsletter" },
      { label: "About Myro",   href: "/about"      },
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

export function PublicFooter() {
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div className="pub-footer-brand">
          <Link href="/about" className="pub-footer-logo" aria-label="Myro home">
            <MyroLogo size={22} />
            <span className="pub-footer-wordmark">Myro</span>
          </Link>
          <p className="pub-footer-tagline">career intelligence</p>
          <p className="pub-footer-sub">
            AI scores your CV across 12 career domains, tailors a version for every job, and shows you exactly which one to send.
          </p>
        </div>

        {FOOTER_COLS.map((col) => (
          <div key={col.title} className="pub-footer-col">
            <div className="pub-footer-col-title">{col.title}</div>
            <ul className="pub-footer-links">
              {col.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className={`pub-footer-link${link.accent ? " pub-footer-link-accent" : ""}`}
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
        <span>Built for job seekers, not recruiters.</span>
      </div>
    </footer>
  )
}
