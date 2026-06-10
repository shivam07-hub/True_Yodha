"use client"

import Image from "next/image"

interface LoopNode {
  word: string
  cap: string
  variant?: "accent" | "ghost"
}

const NODES: LoopNode[] = [
  { word: "Upload", cap: "drop your CV, the Engine reads it" },
  { word: "Score", cap: "0–100 across 10 career domains" },
  { word: "Match", cap: "best-fit roles from live openings" },
  { word: "Tailor", cap: "one CV version per target job" },
  { word: "Apply", cap: "send the version that fits" },
  { word: "Upskill", cap: "practice the exact skills your matches demand", variant: "accent" },
  { word: "repeat", cap: "your score rises, your matches improve", variant: "ghost" },
]

/* 7 nodes at 360/7° intervals starting at 12 o'clock, radius 44% of stage.
   Static positions (n is fixed) — mobile CSS collapses to a vertical chain. */
const RADIUS = 44
const POSITIONS = NODES.map((_, i) => {
  const angle = ((-90 + (360 / NODES.length) * i) * Math.PI) / 180
  return {
    left: `${(50 + RADIUS * Math.cos(angle)).toFixed(3)}%`,
    top: `${(50 + RADIUS * Math.sin(angle)).toFixed(3)}%`,
  }
})

export function LandingLoop() {
  return (
    <section className="lp-loop" aria-label="The loop">
      <div className="lp-wrap">
        <div className="lp-section-head center lp-reveal">
          <h2 className="lp-section-title">Built as a loop, not a one-shot.</h2>
          <p className="lp-section-sub">A CV maker you use once. An engine you come back to.</p>
        </div>

        <div className="lp-loop-stage lp-reveal">
          <svg className="lp-loop-ring-svg" viewBox="0 0 680 680" aria-hidden>
            <g className="lp-loop-ring-rotor">
              <circle className="lp-loop-ring-circle" cx="340" cy="340" r="299" />
            </g>
          </svg>

          <div className="lp-loop-center" aria-hidden>
            <Image src="/brand/aperture-m.png" alt="" width={44} height={44} />
            <div className="lp-loop-center-line">
              The Engine
              <br />
              keeps reading
            </div>
          </div>

          {NODES.map((node, i) => (
            <div
              key={node.word}
              className={`lp-loop-node${node.variant ? ` ${node.variant}` : ""}`}
              style={POSITIONS[i]}
            >
              <div className="lp-loop-node-word">{node.word}</div>
              <div className="lp-loop-node-cap">{node.cap}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
