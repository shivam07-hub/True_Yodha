import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { NAV, muted, tocLink, accentNum, Section, Li, Ul, Sub, P } from "./privacy-components"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Privacy Policy — Myro",
  description: "How Myro collects, uses, and protects your data.",
  alternates: { canonical: `${BASE}/privacy` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Privacy Policy — Myro",
    description: "How Myro collects, uses, and protects your data.",
    type: "website",
    url: `${BASE}/privacy`,
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy — Myro",
    description: "How Myro collects, uses, and protects your data.",
  },
}

export default function PrivacyPage() {
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

      <PublicTopNav active="privacy" showSignIn />

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
            Legal
          </div>
          <h1 style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 12px", color: "var(--tm-text)" }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", margin: 0 }}>
            Effective 30 April 2026 · Last updated 30 May 2026
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
                {NAV.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} style={{ display: "flex", gap: 8, padding: "4px 0", color: "var(--tm-text-muted)", textDecoration: "none", fontSize: "var(--tm-fs-meta)" }}>
                      <span style={accentNum}>{item.n}</span>
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
                {NAV.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} style={tocLink}>
                      <span style={accentNum}>{item.n}</span>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* Main content */}
          <main style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* No-sell callout */}
            <div style={{ background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-lg)", padding: "18px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="var(--tm-interactive)" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4" stroke="var(--tm-interactive)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p style={{ fontWeight: 700, color: "var(--tm-interactive)", margin: "0 0 4px", fontSize: "var(--tm-fs-body)" }}>We do not sell your data.</p>
                <p style={{ margin: 0, fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
                  We do not sell, rent, or trade your personal information to any third party. We do not use your data for advertising.
                </p>
              </div>
            </div>

            <Section id="who-we-are" n="01" title="Who We Are">
              <P>Myro is a product of <strong>Myro Career Intelligence</strong>, Vasant Vihar, West Delhi, Delhi, India (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Myro is an Intelligence-as-a-Service platform for job seekers, available at{" "}
                <a href="https://himyro.com" style={{ color: "var(--tm-interactive)" }}>himyro.com</a>.
                {" "}We also publish the <strong>Myro Job Tracker</strong> Chrome extension.</P>
            </Section>

            <Section id="what-we-collect" n="02" title="What We Collect & Why">
              <Sub title="A. Myro Web Platform" />
              <Ul>
                <Li><strong>Account data:</strong> email address and password hash — to create and authenticate your account.</Li>
                <Li><strong>CV data:</strong> CV text or file you upload — to extract skills and generate job matches.</Li>
                <Li><strong>Skill data:</strong> skills extracted from your CV — to compute your Myro Score and recommend roles.</Li>
                <Li><strong>Job application data:</strong> jobs you save, track, or apply to — to power your tracker and diary.</Li>
                <Li><strong>Diary entries:</strong> text you write in /diary — to track your progress and build skill evidence.</Li>
                <Li><strong>Usage data:</strong> page visits and feature interactions — to maintain service reliability.</Li>
              </Ul>
              <Sub title="B. Myro Job Tracker Chrome Extension" />
              <Ul>
                <Li><strong>Job page content:</strong> when you click &ldquo;Save&rdquo;, the extension reads the job title, company, location, description, and URL from the current page. Sent to your Myro account only.</Li>
                <Li><strong>API token:</strong> your Myro Bearer token is stored locally in{" "}
                  <code style={{ fontFamily: "var(--tm-font-mono)", fontSize: "0.85em", background: "var(--tm-surface-2)", padding: "1px 5px", borderRadius: 4 }}>chrome.storage.local</code>{" "}
                  to authenticate requests. Never sent to any third party.</Li>
                <Li><strong>No passive collection:</strong> the extension does not monitor your browsing, collect web history, or run without your explicit action.</Li>
              </Ul>
              <Sub title="C. Signing in with Google or LinkedIn" />
              <Ul>
                <Li><strong>What they share:</strong> your name, email, and profile picture — plus, for LinkedIn, the public headline you&apos;ve already published. Nothing private, nothing you haven&apos;t already made public.</Li>
                <Li><strong>What we never do:</strong> we don&apos;t post for you, message your network, or read who you&apos;re connected to. If something needs to leave Myro, you tap a button to send it.</Li>
              </Ul>
            </Section>

            <Section id="how-we-use" n="03" title="How We Use Your Data">
              <Ul>
                <Li>To provide and improve Myro services</Li>
                <Li>To compute your Myro Score and job match recommendations</Li>
                <Li>To generate personalised action plans and CV variants</Li>
                <Li>To authenticate you and keep your account secure</Li>
              </Ul>
            </Section>

            <Section id="who-we-share" n="04" title="Who We Share Data With">
              <P>Infrastructure providers we use:</P>
              <Ul>
                <Li><strong>Supabase</strong> — database hosting (EU/US regions)</Li>
                <Li><strong>Railway</strong> — backend hosting</Li>
                <Li><strong>Vercel</strong> — frontend hosting</Li>
                <Li><strong>OpenRouter / Groq / Google</strong> — LLM inference for skill extraction and job ranking. Job description text and CV text may be sent to these providers.</Li>
              </Ul>
              <p style={{ ...muted, marginTop: 12 }}>No data is sold or shared with employers, recruiters, or data brokers.</p>
            </Section>

            <Section id="retention" n="05" title="Data Retention">
              <Ul>
                <Li><strong>Account data:</strong> retained until you delete your account.</Li>
                <Li><strong>CV data:</strong> retained until you delete it or your account.</Li>
                <Li><strong>Extension token:</strong> stored locally on your device; cleared when you remove the extension or reset your token in settings.</Li>
              </Ul>
            </Section>

            <Section id="your-rights" n="06" title="Your Rights">
              <P>You have the right to access your data, correct inaccuracies, request deletion, and export your data.</P>
              <P>Email <a href="mailto:hello@himyro.com" style={{ color: "var(--tm-interactive)" }}>hello@himyro.com</a> to exercise any right.</P>
            </Section>

            <Section id="cookies" n="07" title="Cookies">
              <P>Myro uses session cookies for authentication only. No tracking cookies. No third-party advertising cookies.</P>
            </Section>

            <Section id="security" n="08" title="Security">
              <P>Data is encrypted in transit (TLS) and at rest. Access is controlled via Row Level Security in Supabase, so each account can only access its own records. Authentication is managed by Supabase; passwords are never stored in plain text. No system is perfectly secure, but if a breach affects your personal data we will notify affected users and the relevant authorities as required by law.</P>
              <P>This policy is governed by the laws of India. Where applicable, we process personal data in line with India&rsquo;s Digital Personal Data Protection Act, 2023. The rights described in Section 06 apply to you regardless of where you are located.</P>
            </Section>

            <Section id="children" n="09" title="Children">
              <P>Myro is not directed at children under 13. We do not knowingly collect data from children under 13.</P>
            </Section>

            <Section id="changes" n="10" title="Changes">
              <P>We will update this page when our practices change. Continued use after changes constitutes acceptance. Check the &ldquo;Last updated&rdquo; date at the top of this page.</P>
            </Section>

            <Section id="contact" n="11" title="Contact">
              <P>Questions about this policy? Reach us at:</P>
              <div style={{ background: "var(--tm-surface-2)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "12px 16px", marginTop: 8, display: "inline-block" }}>
                <a href="mailto:hello@himyro.com" style={{ color: "var(--tm-interactive)", fontWeight: 600, fontSize: "var(--tm-fs-body)", textDecoration: "none" }}>
                  hello@himyro.com
                </a>
              </div>
            </Section>

          </main>
        </div>
      </div>

      <PublicFooter />

    </div>
  )
}
