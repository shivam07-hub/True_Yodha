"use client"

import { useEffect, useState } from "react"

interface LevelUpOverlayProps {
  show: boolean
  skillName: string
  newLevel: number
  xpGained: number
  onDone: () => void
}

export function LevelUpOverlay({ show, skillName, newLevel, xpGained, onDone }: LevelUpOverlayProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "out" | "hidden">("hidden")

  useEffect(() => {
    if (!show) return
    setPhase("in")
    const t1 = setTimeout(() => setPhase("hold"), 400)
    const t2 = setTimeout(() => setPhase("out"), 2600)
    const t3 = setTimeout(() => { setPhase("hidden"); onDone() }, 3200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "hidden") return null

  const opacity = phase === "in" ? 0 : phase === "out" ? 0 : 1
  const scale = phase === "in" ? 0.7 : phase === "out" ? 1.08 : 1
  const yOffset = phase === "in" ? 20 : 0

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
      background: phase === "hold" ? "rgba(0,245,212,0.04)" : "transparent",
      transition: "background 400ms",
    }}>
      {/* Radial burst */}
      <div style={{
        position: "absolute",
        width: 400, height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,245,212,0.15) 0%, transparent 70%)",
        transform: `scale(${phase === "hold" ? 1 : 0.3})`,
        opacity: phase === "hold" ? 1 : 0,
        transition: "transform 500ms cubic-bezier(0.16,1,0.3,1), opacity 400ms",
      }} />

      {/* Main card */}
      <div style={{
        position: "relative", zIndex: 1,
        textAlign: "center",
        opacity, transform: `scale(${scale}) translateY(${yOffset}px)`,
        transition: phase === "out"
          ? "opacity 500ms, transform 500ms"
          : "opacity 400ms cubic-bezier(0.16,1,0.3,1), transform 400ms cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Skill unlocked badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 99,
          background: "rgba(0,245,212,0.15)",
          border: "1px solid rgba(0,245,212,0.4)",
          fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#00F5D4", fontWeight: 700,
          marginBottom: 16,
          boxShadow: "0 0 20px rgba(0,245,212,0.3)",
        }}>
          ⬡ SKILL UNLOCKED
        </div>

        {/* Level up text */}
        <div style={{
          fontSize: 72, fontWeight: 900,
          background: "linear-gradient(135deg, #00F5D4, #53FFE3, #00F5D4)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.02em", lineHeight: 1,
          marginBottom: 8,
          filter: "drop-shadow(0 0 30px rgba(0,245,212,0.5))",
        }}>
          LEVEL UP
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, color: "#E8F0FF", marginBottom: 8 }}>
          {skillName}
        </div>
        <div style={{ fontSize: 16, color: "#7A88A8", marginBottom: 16 }}>
          Now at <span style={{ color: "#00F5D4", fontWeight: 700 }}>Level {newLevel}</span>
        </div>

        {/* XP gained */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 20px", borderRadius: 99,
          background: "rgba(0,245,212,0.1)",
          border: "1px solid rgba(0,245,212,0.3)",
          fontSize: 18, fontWeight: 700, color: "#00F5D4",
        }}>
          ✦ +{xpGained} XP earned
        </div>

        {/* Particle dots (pure CSS) */}
        <style>{`
          @keyframes particle-float {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-80px) scale(0); opacity: 0; }
          }
          .lvl-particle {
            position: absolute;
            width: 6px; height: 6px;
            border-radius: 50%;
            background: #00F5D4;
            animation: particle-float 1.2s ease-out forwards;
          }
        `}</style>
        {phase === "hold" && Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="lvl-particle" style={{
            top: -20, left: `${15 + i * 10}%`,
            animationDelay: `${i * 60}ms`,
            background: i % 2 === 0 ? "#00F5D4" : "#53FFE3",
            boxShadow: "0 0 8px rgba(0,245,212,0.8)",
          }} />
        ))}
      </div>
    </div>
  )
}
