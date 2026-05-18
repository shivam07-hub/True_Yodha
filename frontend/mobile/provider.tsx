"use client"

import { createContext, useContext, useEffect, useState } from "react"
import {
  MEDIA_QUERY_MOBILE,
  MEDIA_QUERY_POINTER_FINE,
  MEDIA_QUERY_REDUCED_MOTION,
  type PointerKind,
  type ViewportMode,
} from "./viewport"

export type ViewportState = {
  mode: ViewportMode
  pointer: PointerKind
  reducedMotion: boolean
  isDesktop: boolean
}

// Mobile-safe defaults for SSR + first paint — prevents desktop-only extras
// (ParticleBg, multi-column grids) flashing on slow hydration.
const DEFAULT_STATE: ViewportState = {
  mode: "mobile",
  pointer: "coarse",
  reducedMotion: false,
  isDesktop: false,
}

const ViewportContext = createContext<ViewportState>(DEFAULT_STATE)

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewportState>(DEFAULT_STATE)

  useEffect(() => {
    const mobile = window.matchMedia(MEDIA_QUERY_MOBILE)
    const pointer = window.matchMedia(MEDIA_QUERY_POINTER_FINE)
    const motion = window.matchMedia(MEDIA_QUERY_REDUCED_MOTION)

    const sync = () => {
      const mode: ViewportMode = mobile.matches ? "mobile" : "desktop"
      const ptr: PointerKind = pointer.matches ? "fine" : "coarse"
      setState({
        mode,
        pointer: ptr,
        reducedMotion: motion.matches,
        isDesktop: mode === "desktop" && ptr === "fine",
      })
    }
    sync()

    mobile.addEventListener("change", sync)
    pointer.addEventListener("change", sync)
    motion.addEventListener("change", sync)
    return () => {
      mobile.removeEventListener("change", sync)
      pointer.removeEventListener("change", sync)
      motion.removeEventListener("change", sync)
    }
  }, [])

  return <ViewportContext.Provider value={state}>{children}</ViewportContext.Provider>
}

export function useViewport(): ViewportState {
  return useContext(ViewportContext)
}
