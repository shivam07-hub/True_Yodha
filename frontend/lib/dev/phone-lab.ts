/**
 * Handset lab — the 375×812 viewport `qa:mobile` uses, so an agent on a
 * desktop monitor can still see the phone skins (media queries key off the
 * iframe, not the outer window).
 *
 * Load mode paints chrome + the route skeleton. Live mode iframes the real
 * authed route after a QA session. Neither is a physical phone.
 */

export const PHONE_LAB_WIDTH = 375
export const PHONE_LAB_HEIGHT = 812

export const PHONE_LAB_TABS = [
  { id: "jobs", label: "Jobs", path: "/market" },
  { id: "collections", label: "Collections", path: "/collections" },
  { id: "cv", label: "CV", path: "/cv" },
  { id: "cv-work", label: "Workstation", path: "/cv?edit=1" },
  { id: "prep", label: "Prep", path: "/preparations" },
  { id: "practice", label: "Practice", path: "/practice" },
  { id: "me", label: "Profile", path: "/me" },
] as const

export type PhoneLabTabId = (typeof PHONE_LAB_TABS)[number]["id"]
export type PhoneLabMode = "load" | "live"
export type PhoneLabSurface = "dark" | "light"

export function parsePhoneLabTab(raw: string | undefined): PhoneLabTabId {
  return PHONE_LAB_TABS.some((t) => t.id === raw) ? (raw as PhoneLabTabId) : "jobs"
}

export function parsePhoneLabMode(raw: string | undefined): PhoneLabMode {
  return raw === "live" ? "live" : "load"
}

export function parsePhoneLabSurface(raw: string | undefined): PhoneLabSurface {
  return raw === "light" ? "light" : "dark"
}

export function phoneLabTab(id: PhoneLabTabId) {
  const tab = PHONE_LAB_TABS.find((t) => t.id === id)
  if (!tab) throw new Error(`unknown phone lab tab: ${id}`)
  return tab
}

/** Path `skeletonForPath` understands. Workstation is a query, not a prefix. */
export function phoneLabSkeletonPath(id: PhoneLabTabId): string {
  return phoneLabTab(id).path.split("?")[0]
}
