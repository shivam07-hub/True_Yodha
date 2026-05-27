"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import "./welcome.css"
import { BrandParticles } from "@/components/brand/brand-particles"
import { MyroLogo } from "@/components/myro-logo"
import { useOnboardingHandoff } from "@/store/onboardingHandoff"
import { PublicTopNav } from "@/components/public/top-nav"

const TIMELINE = [
  { t: "0:00", title: "Drop in", desc: "PDF or DOCX. Encrypted at rest. Parsed in ~7s." },
  { t: "1:30", title: "We read it", desc: "Skill Graph seeded. 200+ signals lifted." },
  { t: "3:00", title: "Pick a target", desc: "Live job feed or paste a JD link." },
  { t: "5:00", title: "See gaps", desc: "Match-percentage, missing skills, weak bullets." },
  { t: "7:30", title: "Tailor", desc: "AI rewrites bullets for the role. One click." },
  { t: "10:00", title: "Download", desc: "PDF + shareable link. Apply. Loop closes." },
]

const NUMBERS = [
  { n: "142,308", l: "CVs forged", d: "+1,204 this week" },
  { n: "38,917", l: "roles applied", d: "↑ 12% vs. last 30d" },
  { n: "6,402", l: "offers landed", d: "avg cycle: 24 days" },
  { n: "4.9 / 5", l: "operator rating", d: "from 9,184 reviews" },
]


function CountdownChip() {
  const [secs, setSecs] = useState(10 * 60 - 7)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])
  const m = String(Math.floor(secs / 60)).padStart(2, "0")
  const s = String(secs % 60).padStart(2, "0")
  return (
    <span className="chip chip-accent">
      <span className="dot pulse" />
      <span className="mono">{m}:{s}</span>
      <span className="chip-meta">avg first CV</span>
    </span>
  )
}

function CVPreview() {
  return (
    <div className="cv-stack">
      <div className="cv-paper">
        <div className="cv-name">Your Name</div>
        <div className="cv-title">Title · contact</div>
        <div className="cv-rule" />
        <div className="cv-section">
          <div className="cv-eyebrow">PROFILE</div>
          <div className="cv-line" style={{ width: "92%" }} />
          <div className="cv-line" style={{ width: "78%" }} />
        </div>
        <div className="cv-section">
          <div className="cv-eyebrow">EXPERIENCE</div>
          <div className="cv-line" style={{ width: "84%" }} />
          <div className="cv-line" style={{ width: "70%" }} />
          <div className="cv-line" style={{ width: "88%" }} />
        </div>
        <div className="cv-section">
          <div className="cv-eyebrow">SKILLS</div>
          <div className="cv-line" style={{ width: "64%" }} />
        </div>
        <div className="cv-section">
          <div className="cv-eyebrow">EDUCATION</div>
          <div className="cv-line" style={{ width: "58%" }} />
        </div>
      </div>
      <div className="cv-callout cv-callout-top">
        <span className="mono">+ skill detected:</span>{" "}
        <span className="mono accent">Stakeholder Mgmt L4</span>
      </div>
      <div className="cv-callout cv-callout-bot">
        <span>Myro Score:</span>{" "}
        <span className="mono accent big">
          68<span className="dim">/100</span>
        </span>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  const router = useRouter()
  const setCVFile = useOnboardingHandoff((s) => s.setCVFile)
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCVFile(file)
    router.push("/onboarding")
  }

  return (
    <div className="welcome-root">
      <div className="w-bg">
        <BrandParticles density={0.5} accent="#00F5D4" />
      </div>

      <PublicTopNav showSignIn />

      <main className="w-main">
        <section className="hero hero-split">
          <div>
            <div className="eyebrow">
              <span className="dot pulse" />
              DAY 1 · FIRST RITUAL
            </div>
            <h1 className="hero-h">
              <span className="hero-hi">Manifest your company, align your CV.</span>
              <span className="hero-en">Ready in 10 mins.</span>
            </h1>
            <p className="hero-sub">
              You&apos;re 90 seconds away from your first tailored CV. Upload → see gaps →
              tailor for a target role → download → apply. That&apos;s the whole game on Day 1.
            </p>

            <button type="button" className="upload" onClick={() => fileRef.current?.click()}>
              <div className="upload-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v14M6 9l6-6 6 6M5 21h14" />
                </svg>
              </div>
              <div>
                <div className="upload-title">Drop a PDF or DOCX here</div>
                <div className="upload-sub">Encrypted at rest · parsed in ~7s · +3000 XP welcome grant</div>
              </div>
              <span className="btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Choose file
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFile}
              style={{ display: "none" }}
            />

            <div className="hero-meta-row">
              <CountdownChip />
              <span className="chip">142k operators</span>
            </div>
          </div>
          <div>
            <CVPreview />
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">THE 0 → 10 MINUTE LOOP</div>
          <div className="timeline">
            <div className="timeline-rail">
              <div className="timeline-fill" />
            </div>
            {TIMELINE.map((step, i) => (
              <div key={step.t} className={"tl-step " + (i < 2 ? "done" : i === 2 ? "active" : "")}>
                <div className="tl-node">
                  <span className="tl-num mono">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="tl-time mono">{step.t}</div>
                <div className="tl-title">{step.title}</div>
                <div className="tl-desc">{step.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">WHAT OPERATORS HAVE SHIPPED</div>
          <div className="numbers">
            {NUMBERS.map((it) => (
              <div key={it.l} className="num-card">
                <div className="num-val mono">{it.n}</div>
                <div className="num-lab">{it.l}</div>
                <div className="num-delta">{it.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-eyebrow">WHEN YOUR CV IS READY · WHAT&apos;S NEXT</div>
          <Link href="/myrology" className="bridge">
            <div className="bridge-mark">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <circle cx="20" cy="20" r="6" fill="currentColor" opacity="0.9" />
                <ellipse cx="20" cy="20" rx="16" ry="5.5" stroke="currentColor" strokeWidth="1.2" transform="rotate(-22 20 20)" />
                <circle cx="34" cy="14" r="1.5" fill="currentColor" />
                <circle cx="6" cy="26" r="1.2" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div className="bridge-eyebrow">NEW · MYRO PREMIUM</div>
              <div className="bridge-title">
                Myrology&nbsp;<span className="bridge-sub">— career, aligned to your chart.</span>
              </div>
              <div className="bridge-desc">
                3 sessions with a certified astrologer · personalised birth-chart career report ·
                industry &amp; role alignment · CV tuned to planetary strengths.
              </div>
            </div>
            <div className="bridge-cta">
              <div className="bridge-price">
                <span className="mono big">₹499</span>
                <span className="bridge-once">one-time</span>
              </div>
              <span className="bridge-arrow">Explore Myrology →</span>
            </div>
          </Link>
        </section>

        <footer className="foot">
          <div className="foot-left">
            <MyroLogo size={18} decorative />
            <span>Myro · career intelligence, weaponised.</span>
          </div>
          <div className="foot-right mono dim">v0.9 · build 2026.05.27</div>
        </footer>
      </main>
    </div>
  )
}
