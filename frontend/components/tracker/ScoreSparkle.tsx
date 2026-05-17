"use client"

import { useEffect, useState } from "react"

interface Props {
  trigger: number  // change this number to fire the sparkle
}

interface Particle { id: number; angle: number; distance: number; size: number; gold: boolean }

export function ScoreSparkle({ trigger }: Props) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (trigger === 0) return
    const count = 10
    const next: Particle[] = []
    for (let i = 0; i < count; i++) {
      next.push({
        id: trigger * 100 + i,
        angle: (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4,
        distance: 28 + Math.random() * 18,
        size: 3 + Math.random() * 2,
        gold: i % 2 === 0,
      })
    }
    setParticles(next)
    const id = setTimeout(() => setParticles([]), 1300)
    return () => clearTimeout(id)
  }, [trigger])

  if (particles.length === 0) return null

  const reduced = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  return (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {particles.map(p => (
        <span
          key={p.id}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: p.size, height: p.size, borderRadius: "50%",
            background: p.gold ? "#D4AF37" : "var(--tm-accent)",
            boxShadow: `0 0 6px ${p.gold ? "rgba(212,175,55,0.6)" : "rgba(0,245,212,0.6)"}`,
            animation: reduced ? undefined : `tracker-sparkle-${p.id} 1.2s ease-out forwards`,
            transform: "translate(-50%,-50%)",
          }}
        />
      ))}
      <style>{
        particles.map(p => {
          const dx = Math.cos(p.angle) * p.distance
          const dy = Math.sin(p.angle) * p.distance
          return `@keyframes tracker-sparkle-${p.id} {
            0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
            20% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6); opacity: 0; }
          }`
        }).join("\n")
      }</style>
    </div>
  )
}
