"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import {
  RADAR_CX,
  RADAR_CY,
  RADAR_R,
  RADAR_SVG_SIZE,
  pointsToPolygonAttr,
  radarShape,
} from "@/lib/radar-geometry"
import { useViewport } from "@/mobile"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"

export interface GhostRadarProps {
  domains: string[]
  refNinjaName: string
}

/**
 * Logged-out-viewer conversion mechanic.
 * Outline-only radar; the whole SVG is the click target → /signup?ref={ninja}.
 *
 * Motion budget (per SHAREABILITY plan SH4 + design spec):
 *   - opacity 0 → 0.18 over 600ms, delayed 400ms (after ninja radar draw)
 *   - hover: + glyph scale 1 → 1.08, stroke opacity → 0.30
 *   - prefers-reduced-motion: instant render, no scale
 *
 * Compositor-only transitions (opacity + transform). No backdrop-filter.
 */
export function GhostRadar({ domains, refNinjaName }: GhostRadarProps) {
  const { reducedMotion } = useViewport()
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(false)
  const signup = useSignupGate()

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true)
      return
    }
    const t = window.setTimeout(() => setVisible(true), 400)
    return () => window.clearTimeout(t)
  }, [reducedMotion])

  const { spokes } = radarShape(domains)
  const ringPolygon = pointsToPolygonAttr(spokes)

  const baseOpacity = reducedMotion ? 0.18 : visible ? 0.18 : 0
  const hoverOpacity = hovered ? 0.3 : baseOpacity
  const transition = reducedMotion ? undefined : "opacity 600ms ease, transform 200ms ease-out"

  return (
    <Link
      href={`/signup?ref=${encodeURIComponent(refNinjaName)}`}
      aria-label="Unlock your domain map — sign up"
      style={{
        display: "inline-block",
        outline: "none",
        borderRadius: 12,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
        e.preventDefault()
        signup.open({
          surface: "ghost_radar",
          source: `ref:${refNinjaName}`,
        })
      }}
    >
      <svg
        width={RADAR_SVG_SIZE}
        height={RADAR_SVG_SIZE}
        viewBox={`0 0 ${RADAR_SVG_SIZE} ${RADAR_SVG_SIZE}`}
        role="img"
        aria-hidden="false"
        style={{ display: "block" }}
      >
        {/* Outline ring */}
        <polygon
          points={ringPolygon}
          fill="none"
          stroke="var(--tm-border-soft)"
          strokeWidth="1"
          opacity={hoverOpacity}
          style={{ transition }}
        />
        {/* 12 spokes */}
        {spokes.map((p, i) => (
          <line
            key={i}
            x1={RADAR_CX}
            y1={RADAR_CY}
            x2={p.x}
            y2={p.y}
            stroke="var(--tm-border-soft)"
            strokeWidth="1"
            opacity={hoverOpacity}
            style={{ transition }}
          />
        ))}
        {/* Center + glyph (transform on a <g> for scale anchored at center) */}
        <g
          style={{
            transformOrigin: `${RADAR_CX}px ${RADAR_CY}px`,
            transform: hovered && !reducedMotion ? "scale(1.08)" : "scale(1)",
            transition,
          }}
        >
          <text
            x={RADAR_CX}
            y={RADAR_CY + 10}
            textAnchor="middle"
            fontSize="28"
            fill="var(--tm-interactive)"
            opacity={visible || reducedMotion ? 0.55 : 0}
            style={{ transition }}
            fontFamily="inherit"
          >
            +
          </text>
          <text
            x={RADAR_CX}
            y={RADAR_CY + 30}
            textAnchor="middle"
            fontSize="9"
            fill="var(--tm-text-faint)"
            opacity={visible || reducedMotion ? 0.45 : 0}
            letterSpacing="0.2em"
            style={{ transition, textTransform: "uppercase" }}
            fontFamily="inherit"
          >
            unlock
          </text>
        </g>
        {/* Decorative — radius anchor for future grid-ring add */}
        <desc>{`r=${RADAR_R}`}</desc>
      </svg>
    </Link>
  )
}
