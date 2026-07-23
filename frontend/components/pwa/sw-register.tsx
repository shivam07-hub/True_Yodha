"use client"

import { useEffect } from "react"

/**
 * Registers the service worker (public/sw.js) once the page is interactive.
 * Renders nothing. Required for the installed APK/PWA to satisfy install
 * criteria and to serve the /offline shell when the network drops.
 * Guarded to production + real browser support so dev HMR is never affected.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal — the app runs online without it.
      })
    }
    if (document.readyState === "complete") register()
    else {
      window.addEventListener("load", register)
      return () => window.removeEventListener("load", register)
    }
  }, [])
  return null
}
