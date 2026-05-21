"use client"

import { useState } from "react"
import { MyroLogo } from "@/components/myro-logo"
import "./splash-screen.css"

export function SplashScreen() {
  const [done, setDone] = useState(false)

  if (done) return null

  return (
    <div
      className="tm-splash"
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.animationName === "tm-splash-dismiss") setDone(true)
      }}
    >
      <div className="tm-splash-logo">
        <MyroLogo size={88} />
      </div>
      <div className="tm-splash-text">
        <span className="tm-splash-mark">MYRO</span>
        <span className="tm-splash-tag">Career Intelligence</span>
      </div>
    </div>
  )
}
