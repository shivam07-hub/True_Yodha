type GTag = (command: string, eventName: string, params?: Record<string, unknown>) => void

declare global {
  interface Window { gtag?: GTag }
}

export function trackEvent(name: string, props?: Record<string, string | number>): void {
  if (typeof window === "undefined") return
  if (typeof window.gtag === "function") {
    window.gtag("event", name, props)
  }
}
