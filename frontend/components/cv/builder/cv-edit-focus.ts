import type { AtsFixTarget } from "./ats-checks"

/**
 * Scroll the master editor to the section that owns a failing audit check and
 * focus its first input. The editor renders each section with `id="cv-edit-<target>"`
 * (see MasterEditor), so the audit can route without prop-drilling refs.
 */
export function focusEditorSection(target: AtsFixTarget) {
  if (typeof document === "undefined") return
  const el = document.getElementById(`cv-edit-${target}`)
  if (!el) return
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  el.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")?.focus({ preventScroll: true })
}
