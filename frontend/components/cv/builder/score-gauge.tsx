/**
 * Radial JD-match gauge — single ring with accent stroke + glow.
 */
"use client"

interface ScoreGaugeProps {
  value: number
  size?: number
  label?: string
}

export function ScoreGauge({ value, size = 120, label = "JD MATCH" }: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const radius = size / 2 - 8
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - clamped / 100)
  const cx = size / 2
  const cy = size / 2
  return (
    <div className="cvb-score-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={radius} stroke="var(--tm-border)" strokeWidth="6" fill="none"/>
        <circle
          cx={cx} cy={cy} r={radius}
          stroke="var(--data-1)" strokeWidth="6" fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            filter: "drop-shadow(0 0 6px var(--tm-int-bg-hover))",
            transition: "stroke-dashoffset 600ms var(--tm-ease)",
          }}
        />
      </svg>
      <div className="score-center mono tabnum">
        <div className="score-val">
          {clamped}<span>%</span>
        </div>
        <div className="score-sub">{label}</div>
      </div>
    </div>
  )
}
