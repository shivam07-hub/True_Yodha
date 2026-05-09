"use client"

import { useEffect, useRef, useState } from "react"
import { MyroLogo } from "@/components/myro-logo"

type Phase = "enter" | "visible" | "exit" | "done"

export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("enter")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    // Double-rAF ensures browser has painted before transition fires
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setPhase("visible"))
    )

    const t1 = setTimeout(() => setPhase("exit"), 1900)
    const t2 = setTimeout(() => setPhase("done"), 2400)
    timers.current = [t1, t2]

    return () => {
      cancelAnimationFrame(raf)
      timers.current.forEach(clearTimeout)
    }
  }, [])

  if (phase === "done") return null

  const isExiting = phase === "exit"
  const isVisible = phase === "visible" || isExiting

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#050A18",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        opacity: isExiting ? 0 : 1,
        transition: isExiting
          ? "opacity 500ms cubic-bezier(0.16, 1, 0.3, 1)"
          : "none",
        pointerEvents: isExiting ? "none" : "all",
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1)" : "scale(0.88)",
          transition: "opacity 550ms cubic-bezier(0.16, 1, 0.3, 1), transform 550ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <MyroLogo size={88} />
      </div>

      {/* Wordmark + tagline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 550ms 120ms cubic-bezier(0.16, 1, 0.3, 1), transform 550ms 120ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "#F0F4FF",
          }}
        >
          MYRO
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.14em",
            color: "#6F7891",
            textTransform: "uppercase",
          }}
        >
          Career Intelligence
        </span>
      </div>
    </div>
  )
}
