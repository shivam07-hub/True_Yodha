"use client"

/* The amethyst half: what a cast chart looks like once it is read.
 *
 * Everything in this file is a SPECIMEN and says so. Nobody has entered a birth
 * date by the time this renders, so any figure presented as the visitor's own
 * would be invented. The wheel below is one worked example, carried end to end
 * so the geometry, the readings and the sample Career Map all describe the same
 * imagined native rather than three unrelated mock-ups. */

const HOUSES = [
  "Career", "Income", "Wisdom", "Travel", "Self", "Skills",
  "Method", "Partners", "Risk", "Public", "Network", "Sanctum",
] as const

const GLYPHS = ["♄", "♃", "♂", "☉", "♀", "☿", "☾", "♅", "♆", "♇", "⊕", "★"] as const

/* One fixed specimen chart. Deliberately not randomised: the readings under the
   wheel refer to these exact peaks, and a reseeded polygon would stop matching
   the words beside it. */
const SPECIMEN = [0.92, 0.78, 0.84, 0.55, 0.81, 0.62, 0.71, 0.66, 0.48, 0.74, 0.82, 0.69] as const

const READINGS = [
  {
    glyph: "♃",
    name: "Builds slowly, then compounds",
    meta: "Jupiter influencing the Career domain · long-horizon roles over quick wins",
    val: "STRONG",
  },
  {
    glyph: "♂",
    name: "Wants technical depth, not breadth",
    meta: "Mars in the Skills domain · one craft carried far",
    val: "STRONG",
  },
  {
    glyph: "☿",
    name: "Poor fit for pure client-facing sales",
    meta: "Mercury retrograde at birth · writes better than pitches",
    val: "WATCH",
  },
] as const

function CosmicRadar() {
  const cx = 200
  const cy = 200
  const R = 160
  const pts = HOUSES.map((_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    const r = SPECIMEN[i] * R
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const
  })
  const polyPts = pts.map((p) => p.join(",")).join(" ")

  return (
    <svg
      className="cosmic-svg"
      viewBox="-56 -56 512 512"
      role="img"
      aria-label="Specimen twelve-house career wheel — not a reading of your chart"
    >
      <g className="ring-grid">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={R * f} />
        ))}
      </g>
      <g className="ring-grid">
        {HOUSES.map((h, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2
          return <line key={h} x1={cx} y1={cy} x2={cx + Math.cos(a) * R} y2={cy + Math.sin(a) * R} />
        })}
      </g>
      <circle cx={cx} cy={cy} r="34" fill="none" className="ring-axis" />
      <circle cx={cx} cy={cy} r="22" fill="rgba(176, 132, 255, 0.06)" stroke="var(--my-amethyst)" strokeWidth="1" />
      <text className="ring-center" x={cx} y={cy + 4} textAnchor="middle">MYRO</text>
      <polygon className="ring-fill" points={polyPts} />
      {pts.map((p, i) => (
        <circle key={HOUSES[i]} className="ring-node" cx={p[0]} cy={p[1]} r="3" />
      ))}
      {HOUSES.map((h, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2
        const cos = Math.cos(a)
        // A label centred on the same horizontal line as its glyph runs straight
        // through it — "PUBLIC" landed on top of ♇. Anchoring outward on the
        // left and right flanks moves the text away from the ring instead of
        // across it; only the near-vertical houses stay centred.
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle"
        return (
          <g key={h}>
            <text className="ring-glyph" x={cx + cos * (R + 14)} y={cy + Math.sin(a) * (R + 14) + 5} textAnchor="middle">{GLYPHS[i]}</text>
            <text className="ring-label" x={cx + cos * (R + 30)} y={cy + Math.sin(a) * (R + 30) + 4} textAnchor={anchor}>{h.toUpperCase()}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function ChartLensPanel() {
  return (
    <div className="lens-card lens-card--chart">
      <div className="lens-tag lens-tag--chart">CHART LENS · SPECIMEN</div>
      <CosmicRadar />
      <div className="cosmic-readings">
        {READINGS.map((r) => (
          <div key={r.name} className="reading">
            <div className="reading-glyph">{r.glyph}</div>
            <div>
              <div className="reading-name">{r.name}</div>
              <div className="reading-meta">{r.meta}</div>
            </div>
            <div className="reading-val" data-tone={r.val === "WATCH" ? "watch" : "strong"}>{r.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
