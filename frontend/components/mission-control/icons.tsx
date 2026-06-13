"use client"

import * as React from "react"

export type IconName =
  | "refresh" | "target" | "cart" | "star" | "check" | "chev" | "chevDown"
  | "arrowLeft" | "arrowRight" | "plus" | "x" | "ext" | "forge" | "cv" | "diary"

interface IconProps {
  name: IconName
  size?: number
  stroke?: number
}

export function Icon({ name, size = 18, stroke = 1.6 }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
        <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
        <polyline points="21 3 21 8 16 8" />
        <polyline points="3 21 3 16 8 16" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    cart: (
      <>
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="17" cy="20" r="1.5" />
        <path d="M3 4h2l2.5 11h11l2-8H6" />
      </>
    ),
    star: (
      <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2" />
    ),
    check: <polyline points="20 6 9 17 4 12" />,
    chev: <polyline points="9 18 15 12 9 6" />,
    chevDown: <polyline points="6 9 12 15 18 9" />,
    arrowLeft: (
      <>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </>
    ),
    arrowRight: (
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    ),
    plus: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    ),
    x: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    ext: (
      <>
        <path d="M14 3h7v7" />
        <line x1="10" y1="14" x2="21" y2="3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </>
    ),
    forge: (
      <path d="M3 21h18M5 21v-7a3 3 0 0 1 3-3h2l1-3h2l1 3h2a3 3 0 0 1 3 3v7M9 21v-4M15 21v-4" />
    ),
    cv: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </>
    ),
    diary: (
      <>
        <rect x="4" y="3" width="14" height="18" rx="2" />
        <line x1="8" y1="3" x2="8" y2="21" />
        <line x1="11" y1="8" x2="15" y2="8" />
        <line x1="11" y1="12" x2="15" y2="12" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

interface SparklineProps {
  data?: number[]
}

export function Sparkline({ data = [22, 22, 23, 23, 24, 23, 24, 24, 25, 25, 25, 26, 26] }: SparklineProps) {
  const w = 100, h = 28, pad = 1
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((d, i) => {
    const x = pad + (i * (w - pad * 2)) / (data.length - 1)
    const y = h - pad - ((d - min) / span) * (h - pad * 2)
    return `${x},${y}`
  })
  const linePath = `M ${pts.join(" L ")}`
  const fillPath = `${linePath} L ${w - pad},${h} L ${pad},${h} Z`
  return (
    <div className="mc-sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="mc-spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--data-1)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--data-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#mc-spark-fill)" />
        <path d={linePath} fill="none" stroke="var(--data-1)" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
      </svg>
    </div>
  )
}
