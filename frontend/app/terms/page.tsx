import type { Metadata } from "next"
import Link from "next/link"
import { PublicTopNav } from "@/components/public/top-nav"

const BASE = "https://truemirror.vercel.app"

export const metadata: Metadata = {
  title: "Terms of Service — Myro",
  description: "Terms and conditions for using Myro.",
  alternates: { canonical: `${BASE}/terms` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Terms of Service — Myro",
    description: "Terms and conditions for using Myro.",
    type: "website",
    url: `${BASE}/terms`,
  },
}

const Section = ({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) => (
  <section id={id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <h2 style={{ fontSize: "var(--tm-fs-h3)", fontWeight: 700, color: "var(--tm-text)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--tm-accent)", minWidth: 28 }}>{n}</span>
      {title}
    </h2>
    <div style={{ paddingLeft: 38, display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  </section>
)

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: 0, fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", lineHeight: 1.65 }}>{children}</p>
)

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--tm-bg)", fontFamily: "var(--tm-font-sans)", display: "flex", flexDirection: "column" }}>

      <PublicTopNav showSignIn />

      <header className="relative overflow-hidden px-4 lg:px-8 pt-16 lg:pt-20 pb-12">
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 12% 50%, var(--tm-accent-wash) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: "var(--tm-content-max)", margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 12 }}>
            Legal
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 12px", color: "var(--tm-text)" }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", margin: 0 }}>
            Effective 4 May 2026 · Last updated 4 May 2026
          </p>
        </div>
      </header>

      <div className="px-4 lg:px-8 pb-20" style={{ maxWidth: "var(--tm-content-max)", margin: "0 auto", width: "100%" }}>
        <main style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>

          <Section id="acceptance" n="01" title="Acceptance of Terms">
            <P>By accessing or using Myro (&ldquo;Service&rdquo;), you agree to these Terms. If you do not agree, do not use the Service.</P>
          </Section>

          <Section id="service" n="02" title="Description of Service">
            <P>Myro is an Intelligence-as-a-Service platform that helps job seekers match their skills to roles, track applications, and plan career development. The Service includes the web platform at himyro.com and the Myro Job Tracker Chrome extension.</P>
          </Section>

          <Section id="account" n="03" title="Your Account">
            <P>You must provide accurate information when creating an account. You are responsible for keeping your credentials secure. Notify us immediately at <a href="mailto:hello@himyro.com" style={{ color: "var(--tm-accent)" }}>hello@himyro.com</a> if you suspect unauthorised access.</P>
          </Section>

          <Section id="conduct" n="04" title="Acceptable Use">
            <P>You agree not to: scrape or crawl the Service; reverse-engineer the platform; upload malicious files; impersonate other users; or use the Service for unlawful purposes.</P>
          </Section>

          <Section id="data" n="05" title="Your Content">
            <P>You retain ownership of content you upload (CVs, diary entries). By uploading, you grant Myro a limited licence to process that content solely to provide the Service to you. We do not use your content to train AI models.</P>
          </Section>

          <Section id="ip" n="06" title="Intellectual Property">
            <P>The Myro platform, branding, and software are owned by Myro and protected by applicable law. Nothing in these Terms grants you rights in Myro&rsquo;s IP beyond the limited right to use the Service.</P>
          </Section>

          <Section id="disclaimer" n="07" title="Disclaimers">
            <P>The Service is provided &ldquo;as is&rdquo; without warranties of any kind. Job matches and recommendations are algorithmic suggestions, not guarantees of employment. We do not guarantee the accuracy of job listings, which are sourced from third-party job boards.</P>
          </Section>

          <Section id="liability" n="08" title="Limitation of Liability">
            <P>To the maximum extent permitted by law, Myro will not be liable for indirect, incidental, or consequential damages arising from your use of the Service.</P>
          </Section>

          <Section id="termination" n="09" title="Termination">
            <P>You may delete your account at any time. We may suspend or terminate accounts that violate these Terms. On termination, your right to use the Service ends immediately.</P>
          </Section>

          <Section id="changes" n="10" title="Changes to Terms">
            <P>We may update these Terms. We will update the &ldquo;Last updated&rdquo; date above. Continued use after changes constitutes acceptance.</P>
          </Section>

          <Section id="contact" n="11" title="Contact">
            <P>Questions? Email us at:</P>
            <div style={{ background: "var(--tm-surface-2)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "12px 16px", display: "inline-block" }}>
              <a href="mailto:hello@himyro.com" style={{ color: "var(--tm-accent)", fontWeight: 600, fontSize: "var(--tm-fs-body)", textDecoration: "none" }}>
                hello@himyro.com
              </a>
            </div>
          </Section>

        </main>
      </div>

      <footer style={{ borderTop: "1px solid var(--tm-border-soft)", padding: "24px 32px", textAlign: "center" }}>
        <Link href="/" style={{ color: "var(--tm-accent)", textDecoration: "none", fontSize: "var(--tm-fs-meta)", fontWeight: 500 }}>
          ← Back to Myro
        </Link>
        <p style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)", margin: "8px 0 0" }}>
          © 2026 Myro. All rights reserved.
        </p>
      </footer>

    </div>
  )
}
