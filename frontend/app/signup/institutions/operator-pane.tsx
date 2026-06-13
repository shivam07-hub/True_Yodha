"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { SignupForm } from "@/components/auth/signup-form"

/** Animated count-up for the live-intel stat numbers. */
function useCountUp(active: boolean) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!active || !rootRef.current) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const nums = rootRef.current.querySelectorAll<HTMLElement>(".es-stat-num[data-target]")
    const fmt = (n: number) => n.toLocaleString("en-US")
    const frames: number[] = []
    nums.forEach((el) => {
      const target = parseInt(el.dataset.target ?? "0", 10)
      if (reduce) { el.textContent = fmt(target); return }
      const dur = 1200, start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur)
        const e = 1 - Math.pow(1 - t, 5)
        el.textContent = fmt(Math.round(target * e))
        if (t < 1) frames.push(requestAnimationFrame(tick))
      }
      frames.push(requestAnimationFrame(tick))
    })
    const ts = rootRef.current.querySelector<HTMLElement>("[data-intel-ts]")
    if (ts) {
      const d = new Date()
      ts.textContent = `UPDATED ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`
    }
    return () => frames.forEach(cancelAnimationFrame)
  }, [active])
  return rootRef
}

export function OperatorPane({ active, next }: { active: boolean; next: string | null }) {
  const statsRef = useCountUp(active)
  return (
    <>
      <section className="es-left es-mode-fade" aria-label="Why Myro for operators">
        <span className="es-eyebrow">Free · for operators</span>
        <h1 className="es-headline">
          Score your CV. Tailor every version. Send the <span className="es-glow">right one</span>.
        </h1>
        <p className="es-subhead">
          Upload one master CV. Fork a tailored version for each role you target. See every
          version scored against live job descriptions — so you know which one to send.
        </p>

        <div className="es-commit-card" aria-label="Example CV hub">
          <div className="es-commit-head">
            <div className="es-commit-head-label">Example · 1 master · 2 versions</div>
            <div className="es-commit-head-meta">scored against live jobs</div>
          </div>
          <svg className="es-commit-svg" viewBox="0 0 380 180" role="img" aria-labelledby="es-cg-title">
            <title id="es-cg-title">A baseline CV with two tailored versions and one upcoming.</title>
            <path className="es-commit-rail" d="M14,22 L14,142" />
            <path className="es-commit-branch" d="M14,62 L26,62" />
            <path className="es-commit-branch" d="M14,102 L26,102" />
            <path className="es-commit-ghost-line" d="M14,142 L26,142" />
            <circle className="es-commit-dot-baseline" cx="14" cy="22" r="5" />
            <circle className="es-commit-dot" cx="26" cy="62" r="5" />
            <circle className="es-commit-dot" cx="26" cy="102" r="5" />
            <circle className="es-commit-ghost-dot" cx="26" cy="142" r="5" />
            <text className="es-commit-label es-baseline" x="42" y="22" dominantBaseline="central">baseline</text>
            <text className="es-commit-label" x="42" y="62" dominantBaseline="central">razorpay · backend</text>
            <text className="es-commit-label" x="42" y="102" dominantBaseline="central">stripe · platform</text>
            <text className="es-commit-label es-ghost" x="42" y="142" dominantBaseline="central">your next version</text>
            <text className="es-commit-score" x="306" y="22" dominantBaseline="central" textAnchor="end">62</text>
            <text className="es-commit-score" x="306" y="62" dominantBaseline="central" textAnchor="end">81</text>
            <text className="es-commit-score" x="306" y="102" dominantBaseline="central" textAnchor="end">86</text>
            <text className="es-commit-delta" x="370" y="62" dominantBaseline="central" textAnchor="end">+19</text>
            <text className="es-commit-delta" x="370" y="102" dominantBaseline="central" textAnchor="end">+24</text>
          </svg>
        </div>

        <div className="es-steps">
          <div className="es-step">
            <div className="es-step-num">01</div>
            <p className="es-step-label">Save your <span className="es-step-emph">master</span> CV.</p>
            <p className="es-step-body">One clean source. No more hunting through folders.</p>
          </div>
          <div className="es-step">
            <div className="es-step-num">02</div>
            <p className="es-step-label"><span className="es-step-emph">Tailor versions</span> per job.</p>
            <p className="es-step-body">Edit once, fork. Each version scored against the JD.</p>
          </div>
          <div className="es-step">
            <div className="es-step-num">03</div>
            <p className="es-step-label">Send the <span className="es-step-emph">right one</span>.</p>
            <p className="es-step-body">Pick by score, skill match, and recruiter behavior data.</p>
          </div>
        </div>

        <div className="es-intel-card" ref={statsRef}>
          <div className="es-intel-head">
            <div className="es-intel-head-label">
              <span className="es-live-dot" aria-hidden="true" /> What&apos;s hiring right now
            </div>
            <div className="es-intel-head-ts" data-intel-ts>UPDATED 00:00 UTC</div>
          </div>
          <div className="es-intel-stats">
            <div className="es-stat">
              <div className="es-stat-num" data-target="48217">0</div>
              <div className="es-stat-label">Live jobs</div>
              <div className="es-stat-delta">↑ 1,204 / 24h</div>
            </div>
            <div className="es-stat">
              <div className="es-stat-num" data-target="12463">0</div>
              <div className="es-stat-label">Companies</div>
              <div className="es-stat-delta">↑ 38 / 24h</div>
            </div>
            <div className="es-stat">
              <div className="es-stat-num" data-target="38">0</div>
              <div className="es-stat-label">Industries</div>
              <div className="es-stat-delta es-flat">— stable</div>
            </div>
          </div>
        </div>

        <div className="es-trust">
          <div className="es-trust-label">As covered in</div>
          <div className="es-logos">
            <span className="es-logo">YourStory</span>
            <span className="es-logo es-logo-mono">inc42/</span>
            <span className="es-logo">Entrackr</span>
            <span className="es-logo es-logo-mono">moneycontrol</span>
            <span className="es-logo">The Ken</span>
          </div>
        </div>
      </section>

      <aside className="es-right es-mode-fade" aria-label="Sign up — operator">
        <div className="es-form-card">
          <div className="es-form-eyebrow">
            <span>Powered by Myro Coins</span> <span className="es-badge">~60 sec</span>
          </div>
          <h2 className="es-form-title">Start your CV hub</h2>
          <p className="es-form-sub">
            Score your CV against live jobs. Keep every version you tailor. One account,
            everything from upload to apply.
          </p>
          <div className="es-operator-form">
            <SignupForm surface="page" next={next} showLoginLink={false} />
          </div>
        </div>
        <p className="es-alt-cta">
          Already have an account? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in →</Link>
        </p>
      </aside>
    </>
  )
}
