"use client"

import Link from "next/link"
import { Layers, BarChart3, Activity, Moon, ArrowRight, type LucideIcon } from "lucide-react"
import { SectionTitle } from "@/components/public/landing/section-title"

interface Surface {
  title: string
  href: string
  body: string
  engineLine: string
  Icon: LucideIcon
}

const SURFACES: Surface[] = [
  {
    title: "CV Hub",
    href: "/cv-preview",
    body: "Every version of your CV in one place — master, tailored, scored. No more Drive folders and Canva exports.",
    engineLine: "each version scored against the live role it targets",
    Icon: Layers,
  },
  {
    title: "Skill Intelligence",
    href: "/signup",
    body: "See the gap between the skills on your CV and the ones companies are hiring for. Close it with levelled practice, L1 → L5.",
    engineLine: "gap = your extracted skills vs live demand",
    Icon: BarChart3,
  },
  {
    title: "Live Job Market + Tracker",
    href: "/intel",
    body: "Openings read straight from career pages — matched to your skills, scored for fit, tracked from saved to offer.",
    engineLine: "matches ranked by skill overlap, refreshed continuously",
    Icon: Activity,
  },
]

export function LandingSurfaces() {
  return (
    <section className="lp-surfaces" id="surfaces" aria-label="The surfaces">
      <div className="lp-wrap">
        <div className="lp-section-head lp-reveal">
          <SectionTitle>Three ways into the Engine.</SectionTitle>
        </div>

        <div className="lp-surface-grid">
          {SURFACES.map(({ Icon, ...s }) => (
            <Link key={s.title} href={s.href} className="lp-surface-card lp-reveal">
              <div className="lp-surface-top">
                <span className="lp-surface-icon" aria-hidden>
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <span className="lp-surface-title">{s.title}</span>
                <span className="lp-surface-arrow" aria-hidden>
                  <ArrowRight size={18} strokeWidth={1.5} />
                </span>
              </div>
              <p className="lp-surface-body">{s.body}</p>
              <p className="lp-engine-line">
                <span className="tag">← ENGINE:</span> {s.engineLine}
              </p>
            </Link>
          ))}

          {/* Myrology — deliberately quieter sub-brand card, separate lens */}
          <Link href="/myrology" className="lp-surface-card myrology lp-reveal">
            <div className="lp-surface-top">
              <span className="lp-surface-icon" aria-hidden>
                <Moon size={20} strokeWidth={1.5} />
              </span>
              <span className="lp-surface-title">Myrology</span>
            </div>
            <p className="lp-surface-body">
              A separate lens. Career data points read through the positions of the stars —
              one-on-one, opt-in, never mixed into your Myro Score.
            </p>
            <p className="lp-myrology-link">myrology →</p>
          </Link>
        </div>
      </div>
    </section>
  )
}
