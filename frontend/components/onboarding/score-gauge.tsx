"use client"

import { useEffect, useState } from "react"

interface Props {
  score: number // 0–100
}

export function ScoreGauge({ score }: Props) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    const timeout = setTimeout(() => setAnimated(score), 100)
    return () => clearTimeout(timeout)
  }, [score])

  // SVG half-circle gauge
  const radius = 80
  const circumference = Math.PI * radius
  const offset = circumference - (animated / 100) * circumference

  function getColor(s: number) {
    if (s >= 70) return "#22c55e"
    if (s >= 40) return "#f59e0b"
    return "#ef4444"
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="200" height="110" viewBox="0 0 200 110">
        {/* Track */}
        <path
          d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M 20 100 A ${radius} ${radius} 0 0 1 180 100`}
          fill="none"
          stroke={getColor(animated)}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s ease-out, stroke 0.5s" }}
        />
      </svg>
      <div className="text-5xl font-bold -mt-8" style={{ color: getColor(animated) }}>
        {Math.round(animated)}
      </div>
      <div className="text-xs text-muted-foreground">Mirror Score / 100</div>
    </div>
  )
}
