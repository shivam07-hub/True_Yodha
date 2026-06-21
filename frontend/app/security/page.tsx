import type { Metadata } from "next"
import type { CSSProperties } from "react"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { muted, tocLink, accentNum, Section, Li, Ul, P } from "../privacy/privacy-components"

const BASE = "https://www.himyro.com"

// Security-page TOC. The shared Section/P/Li/Ul primitives are reused from the
// privacy shell; only the section list differs.
const SEC_NAV = [
  { id: "your-cv",        n: "01", title: "Your CV" },
  { id: "encryption",     n: "02", title: "Encryption" },
  { id: "isolation",      n: "03", title: "Account Isolation" },
  { id: "infrastructure", n: "04", title: "Infrastructure" },
  { id: "if-wrong",       n: "05", title: "If Something Goes Wrong" },
] as const

export const metadata: Metadata = {
  title: "Security — Myro",
  description: "How Myro keeps your CV and account data safe.",
  alternates: { canonical: `${BASE}/security` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Security — Myro",
    description: "How Myro keeps your CV and account data safe.",
    type: "website",
    url: `${BASE}/security`,
  },
  twitter: {
    card: "summary",
    title: "Security — Myro",
    description: "How Myro keeps your CV and account data safe.",
  },
}

export default function SecurityPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--tm-bg)",
        fontFamily: "var(--tm-font-sans)",
        display: "flex",
        flexDirection: "column",
        ["--tm-fs-heading" as string]: "1.125rem",
        ["--tm-fs-body" as string]: "0.8125rem",
        ["--tm-fs-meta" as string]: "0.6875rem",
      }}
    >

      <PublicTopNav showSignIn />

      {/* Hero */}
      <header className="relative overflow-hidden px-4 lg:px-8 pt-16 lg:pt-20 pb-12">
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 12% 50%, var(--tm-int-bg-wash) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "50%", right: "6%",
          transform: "translateY(-50%)", width: 220, height: 220,
          opacity: 0.065, pointerEvents: "none",
        }}>
          <svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="78" stroke="var(--tm-interactive)" strokeWidth="10" strokeDasharray="3 6" />
            <circle cx="100" cy="100" r="56" stroke="var(--tm-interactive)" strokeWidth="3" strokeDasharray="2 9" opacity="0.5" />
            <circle cx="100" cy="100" r="22" fill="var(--tm-interactive)" />
            <circle cx="100" cy="100" r="12" fill="var(--tm-interactive)" opacity="0.6" />
          </svg>
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: "var(--tm-content-max)", margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 12 }}>
            Trust
          </div>
          <h1 style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 12px", color: "var(--tm-text)" }}>
            Security
          </h1>
          <p style={{ fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
            How Myro keeps your CV and account data safe — in plain language.
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="px-4 lg:px-8 pb-20" style={{ maxWidth: "var(--tm-content-max)", margin: "0 auto" }}>
        <div className="flex flex-col lg:grid gap-10 lg:gap-14" style={{ gridTemplateColumns: "220px 1fr", alignItems: "start" }}>

          {/* TOC */}
          <aside>
            <details className="lg:hidden mb-6" style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "12px 16px" }}>
              <summary style={{ fontWeight: 600, fontSize: "var(--tm-fs-body)", color: "var(--tm-text)", cursor: "pointer", userSelect: "none", listStyle: "none" }}>
                Contents ▾
              </summary>
              <ol style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 2 }}>
                {SEC_NAV.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} style={{ display: "flex", gap: 8, padding: "4px 0", color: "var(--tm-text-muted)", textDecoration: "none", fontSize: "var(--tm-fs-meta)" }}>
                      <span style={accentNum as CSSProperties}>{item.n}</span>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            <div className="hidden lg:block" style={{ position: "sticky", top: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 12 }}>
                Contents
              </div>
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                {SEC_NAV.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} style={tocLink as CSSProperties}>
                      <span style={accentNum as CSSProperties}>{item.n}</span>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* Main content */}
          <main style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            <Section id="your-cv" n="01" title="Your CV">
              <P>Only you can see your CV. Your public profile shows your Myro Score and domain map — the CV text behind it stays in your account.</P>
              <P>When you score a CV before signing up, Myro reads it to compute your score and then discards it. It is saved only when you create an account.</P>
            </Section>

            <Section id="encryption" n="02" title="Encryption">
              <P>Your data is encrypted in transit using TLS and encrypted at rest. Passwords are handled by Supabase and stored as hashes, not plain text.</P>
            </Section>

            <Section id="isolation" n="03" title="Account Isolation">
              <P>Access to your records is enforced at the database layer through Row Level Security. Each account can read and write only its own data.</P>
            </Section>

            <Section id="infrastructure" n="04" title="Infrastructure">
              <P>Myro is built on SOC 2-certified infrastructure:</P>
              <Ul>
                <Li><strong>Supabase</strong> — database and authentication</Li>
                <Li><strong>Railway</strong> — backend hosting</Li>
                <Li><strong>Vercel</strong> — frontend hosting</Li>
              </Ul>
              <p style={{ ...(muted as CSSProperties), marginTop: 12 }}>
                SOC 2 certification belongs to these providers. Myro relies on their certified infrastructure to host and run the service.
              </p>
            </Section>

            <Section id="if-wrong" n="05" title="If Something Goes Wrong">
              <P>No system is perfectly secure. If a breach affects your personal data, we will notify affected users and the relevant authorities as required by law.</P>
              <P>For the full legal detail on how we collect, use, and retain data, see our{" "}
                <a href="/privacy" style={{ color: "var(--tm-interactive)" }}>Privacy Policy</a>.</P>
            </Section>

          </main>
        </div>
      </div>

      <PublicFooter />

    </div>
  )
}
