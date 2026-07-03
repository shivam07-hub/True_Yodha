import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { Section, P, Ul, Li, Sub, tocLink, accentNum } from "../privacy/privacy-components"

const BASE = "https://www.himyro.com"

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
  twitter: {
    card: "summary",
    title: "Terms of Service — Myro",
    description: "Terms and conditions for using Myro.",
  },
}

const NAV = [
  { id: "acceptance",     n: "01", title: "Acceptance" },
  { id: "service",        n: "02", title: "The Service" },
  { id: "account",        n: "03", title: "Your Account" },
  { id: "conduct",        n: "04", title: "Acceptable Use" },
  { id: "content",        n: "05", title: "Your Content" },
  { id: "ip",             n: "06", title: "Intellectual Property" },
  { id: "payments",       n: "07", title: "Payments & Tokens" },
  { id: "not-an-agency",  n: "08", title: "Not an Employer" },
  { id: "disclaimer",     n: "09", title: "Disclaimers" },
  { id: "liability",      n: "10", title: "Limitation of Liability" },
  { id: "indemnity",      n: "11", title: "Indemnification" },
  { id: "security",       n: "12", title: "Data Security" },
  { id: "governing-law",  n: "13", title: "Governing Law" },
  { id: "termination",    n: "14", title: "Termination" },
  { id: "changes",        n: "15", title: "Changes" },
  { id: "contact",        n: "16", title: "Contact" },
] as const

export default function TermsPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--tm-bg)",
        fontFamily: "var(--tm-font-sans)",
        display: "flex",
        flexDirection: "column",
        ["--tm-fs-heading" as string]: "1.0625rem",
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
            Legal
          </div>
          <h1 style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 12px", color: "var(--tm-text)" }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", margin: 0 }}>
            Effective 4 May 2026 · Last updated 2 June 2026
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
          <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* No-employer shield callout */}
            <div style={{ background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-lg)", padding: "18px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="var(--tm-interactive)" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4" stroke="var(--tm-interactive)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p style={{ fontWeight: 700, color: "var(--tm-interactive)", margin: "0 0 4px", fontSize: "var(--tm-fs-body)" }}>Myro is not an employer or recruiter.</p>
                <p style={{ margin: 0, fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
                  We are a software tool. We do not guarantee jobs, interviews, or responses. Every hiring decision belongs to the employer — see Section 08.
                </p>
              </div>
            </div>

            <Section id="acceptance" n="01" title="Acceptance of Terms">
              <P>Myro (the &ldquo;Service&rdquo;) is made from India and operated by Myro (&ldquo;Myro&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</P>
            </Section>

            <Section id="service" n="02" title="Description of Service">
              <P>Myro is an Intelligence-as-a-Service platform that helps job seekers match their skills to roles, track applications, and plan career development. The Service includes the web platform at himyro.com and the Myro Job Tracker Chrome extension.</P>
            </Section>

            <Section id="account" n="03" title="Your Account">
              <P>You must provide accurate information when creating an account. You are responsible for keeping your credentials secure. Notify us immediately at <a href="mailto:hello@himyro.com" style={{ color: "var(--tm-interactive)" }}>hello@himyro.com</a> if you suspect unauthorised access.</P>
              <Sub title="Signing in with Google or LinkedIn" />
              <P>You may sign in using your Google or LinkedIn account. When you do, we receive only your name, email address, and profile picture — and, for LinkedIn, the public headline you have already published. We receive nothing private and nothing you have not already made public. We use this read-only access solely to create and identify your account.</P>
              <P>Through these integrations Myro <strong>never</strong> posts on your behalf, messages your network, or reads who you are connected to. If anything ever needs to leave Myro, you do it yourself by tapping a button. Your use of Google and LinkedIn remains subject to their own terms, and you can revoke Myro&rsquo;s access from those providers at any time. See our <a href="/privacy" style={{ color: "var(--tm-interactive)" }}>Privacy Policy</a> for full detail.</P>
            </Section>

            <Section id="conduct" n="04" title="Acceptable Use">
              <P>You agree not to:</P>
              <Ul>
                <Li>scrape, crawl, or harvest data from the Service;</Li>
                <Li>reverse-engineer, decompile, or probe the platform;</Li>
                <Li>upload malicious files or attempt to disrupt the Service;</Li>
                <Li>impersonate another person or misrepresent your identity;</Li>
                <Li>use the Service for any unlawful purpose.</Li>
              </Ul>
            </Section>

            <Section id="content" n="05" title="Your Content">
              <P>You retain ownership of content you upload (CVs, diary entries). By uploading, you grant Myro a limited licence to process that content solely to provide the Service to you. We do not use your content to train AI models.</P>
            </Section>

            <Section id="ip" n="06" title="Intellectual Property">
              <P>The Myro platform, branding, and software are owned by Myro and protected by applicable law. Nothing in these Terms grants you rights in Myro&rsquo;s IP beyond the limited right to use the Service.</P>
            </Section>

            <Section id="payments" n="07" title="Payments, Tokens &amp; Refunds">
              <Sub title="What you are buying" />
              <P>Myro runs on in-platform credits called <strong>tokens</strong>. Tokens are digital, consumable credits used to unlock optional features (such as company follows, match refreshes, focused practice sessions, and premium reports). <strong>Tokens are not money, legal tender, or financial instruments.</strong> They have no cash value, are non-transferable, cannot be exchanged for cash, and exist only inside the Service. You may also earn tokens for free through ordinary use of the Service.</P>
              <P>Tokens are a <strong>closed-loop, single-merchant utility credit</strong> usable only inside Myro to unlock Myro&rsquo;s own software features. They cannot be transferred to any other person, loaded onto any card or wallet, used at any third party, or redeemed for cash, goods, or services outside the Service. Tokens are <strong>not a prepaid payment instrument</strong> under the Reserve Bank of India&rsquo;s directions and are not a means of payment to any third party — they are simply a way to access features within Myro.</P>
              <Sub title="What your payment funds" />
              <P>When you buy tokens or any paid feature, your payment goes towards the cost of operating Myro — including servers, infrastructure, data processing, and ongoing development. <strong>The purpose of payment is to keep the Service running so that career intelligence remains accessible and affordable. Payment does not buy, and is in no way a payment for, any job, interview, application, shortlisting, placement, response, or employment outcome.</strong> Myro sells software access only — see Section 08.</P>
              <Sub title="Myro distributes listings — it does not own them" />
              <P>Job listings shown in the Service are sourced from employers&rsquo; own websites, official career portals, and public job boards. <strong>Myro acts only as a distributor and aggregator of these listings; we are not the source, author, employer, or guarantor of any listing.</strong> Your payment is for access to Myro&rsquo;s intelligence and software features, never for access to, priority in, or any advantage with any employer, listing, or hiring process. We do not charge employers to list and do not control any listing&rsquo;s accuracy, availability, or outcome.</P>
              <Sub title="Pricing" />
              <P>Prices are shown in Indian Rupees (INR) at checkout and may change at any time. Promotional or launch pricing is offered at our discretion and may be withdrawn. The price applicable to a purchase is the price displayed at the moment you complete that purchase.</P>
              <Sub title="Payment processing" />
              <P>Payments are processed by our third-party payment partner, <strong>Razorpay</strong>. Your card, UPI, and banking details are handled by Razorpay under its own terms and privacy policy; Myro does not receive or store your full payment-instrument details. By paying, you also agree to the payment partner&rsquo;s terms.</P>
              <Sub title="Cancellation &amp; Refunds" />
              <P><strong>Tokens and in-platform credits.</strong> Tokens and paid digital features are delivered and consumed immediately on purchase. For this reason, <strong>purchases of tokens are final and non-refundable</strong>, and tokens cannot be cancelled once purchased. Unused tokens are not refundable.</P>
              <P><strong>Myrology consultations.</strong> A Myrology consultation is a one-time paid human service. You may cancel and receive a <strong>full refund any time before your session is delivered</strong>. <strong>Once the consultation has been delivered, the service is complete and the fee is non-refundable</strong>, because the work has already been performed.</P>
              <P><strong>Exceptions — always honoured.</strong> Regardless of the above, we will refund you where a refund is required by applicable law, or where you were charged in error (for example, a duplicate charge, or a payment for which the tokens or service was never delivered). For any billing concern, email us at <a href="mailto:hello@himyro.com" style={{ color: "var(--tm-interactive)" }}>hello@himyro.com</a> (or our Grievance Officer at <a href="mailto:grievance@himyro.com" style={{ color: "var(--tm-interactive)" }}>grievance@himyro.com</a>) within 7 days of the charge and we will investigate in good faith and process eligible refunds to your original payment method via Razorpay.</P>
            </Section>

            <Section id="not-an-agency" n="08" title="Myro Is Not an Employer or Recruiter">
              <Sub title="What Myro is" />
              <P>Myro is a software tool that provides career intelligence. <strong>Myro is not an employment agency, recruiter, staffing firm, or hiring intermediary.</strong> We do not employ you, do not place you in jobs, and are not a party to any application, interview, or offer between you and any employer.</P>
              <Sub title="Listings are third-party" />
              <P>Job listings are aggregated from third-party job boards and public sources. We do not control, endorse, verify, or guarantee any listing, employer, salary, or hiring process. <strong>All hiring decisions are made solely by the relevant employer.</strong> Myro is not responsible or liable for any employer&rsquo;s conduct, decisions, screening, rejection, non-response, or for the accuracy, legality, or availability of any listing.</P>
              <Sub title="No guarantee of outcomes" />
              <P>Myro does not guarantee that you will receive interviews, offers, responses, or employment of any kind. Match scores, recommendations, and CV suggestions are algorithmic outputs, not promises of any outcome.</P>
              <Sub title="Operator &amp; grievance details" />
              <P>The Service is owned and operated by Myro, made from India. Myro operates as an <strong>intermediary and aggregator</strong> that distributes job listings sourced from employers&rsquo; websites and public job boards; it is not the seller, employer, or recruiter behind any listing. For any complaint about the Service, a listing, or a payment, contact our Grievance Officer at <a href="mailto:grievance@himyro.com" style={{ color: "var(--tm-interactive)" }}>grievance@himyro.com</a>. We will acknowledge complaints within 24 hours and resolve them within 15 days, as required by applicable law.</P>
            </Section>

            <Section id="disclaimer" n="09" title="Disclaimers">
              <P>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, whether express or implied, including any implied warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that any result, score, or listing is accurate or complete.</P>
            </Section>

            <Section id="liability" n="10" title="Limitation of Liability">
              <P>To the maximum extent permitted by law, Myro and its founders, employees, and contractors will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of employment, income, opportunity, data, or goodwill, arising from or related to your use of (or inability to use) the Service — including any reliance on job listings, match scores, or recommendations.</P>
              <P>To the maximum extent permitted by law, Myro&rsquo;s total aggregate liability for any claim relating to the Service is limited to the greater of (a) the amount you paid Myro in the twelve months before the claim, or (b) INR 5,000.</P>
              <P>Nothing in these Terms limits any liability that cannot be limited or excluded under applicable law, including liability for fraud or gross negligence.</P>
            </Section>

            <Section id="indemnity" n="11" title="Indemnification">
              <P>You agree to indemnify and hold harmless Myro and its founders, employees, and contractors from any claim, demand, loss, or expense (including reasonable legal fees) arising from your misuse of the Service, your violation of these Terms, your violation of any law, or your infringement of any third party&rsquo;s rights.</P>
            </Section>

            <Section id="security" n="12" title="Data Security">
              <P>We take reasonable technical and organisational measures to protect your data. All traffic is encrypted in transit using TLS, and data is encrypted at rest. Access to your records is enforced at the database layer through Row Level Security, so each account can only read or write its own data. Authentication is managed by Supabase; we never store your password in plain text.</P>
              <P>No method of transmission or storage is perfectly secure. While we work to protect your data, we cannot guarantee absolute security, and you use the Service at your own risk. If we become aware of a breach affecting your personal data, we will notify affected users and the relevant authorities as required by applicable law. How we collect, use, and retain data is described in our <a href="/privacy" style={{ color: "var(--tm-interactive)" }}>Privacy Policy</a>.</P>
            </Section>

            <Section id="governing-law" n="13" title="Governing Law &amp; Jurisdiction">
              <P>These Terms are governed by the laws of India, without regard to conflict-of-law rules.</P>
            </Section>

            <Section id="termination" n="14" title="Termination">
              <P>You may delete your account at any time. We may suspend or terminate accounts that violate these Terms. On termination, your right to use the Service ends immediately. Sections that by their nature should survive termination (including Payments, Disclaimers, Limitation of Liability, Indemnification, and Governing Law) will survive.</P>
            </Section>

            <Section id="changes" n="15" title="Changes to Terms">
              <P>We may update these Terms. We will update the &ldquo;Last updated&rdquo; date above. Continued use after changes constitutes acceptance.</P>
            </Section>

            <Section id="contact" n="16" title="Contact">
              <P>Questions about these Terms? Reach us at:</P>
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
