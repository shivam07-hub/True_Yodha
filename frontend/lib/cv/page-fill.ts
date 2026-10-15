/**
 * Page fill for the CV the person actually downloads.
 *
 * The PDF is A4 with 14mm margins (`backend/app/services/cv_pdf_html.py`) and the
 * sheet's on-screen padding and footer are stripped before Chromium paginates
 * (`_SERVER_PRINT_OVERRIDE`). A character budget cannot see that, and it used to
 * refuse a download that printed at 97%. This module measures the export box.
 *
 * Download is never gated on the result. `fits` is a fact about the page, not a
 * permission.
 */

import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"

/** Chromium's CSS pixel, used by `page.pdf`. */
const CSS_PX_PER_INCH = 96
const MM_PER_INCH = 25.4

/** A4, matching `format="A4"` and `@page { size: A4; margin: 14mm }`. */
export const PDF_PAGE_MM = { width: 210, height: 297, margin: 14 } as const

/** Sub-pixel slack so a rounding error does not flip a fitting CV to two pages. */
export const PAGE_SLACK_PX = 2

export interface PageFill {
  /** Content height ÷ one export page. 1 is exactly one page. */
  ratio: number
  /** round(ratio * 100). May exceed 100. */
  pct: number
  /** Export page count. At least 1 once measured. */
  pages: number
  /** True when the export fits on one page. */
  fits: boolean
  /** False until the sheet has been laid out. An unmeasured CV still downloads. */
  measured: boolean
}

export const UNMEASURED_PAGE_FILL: PageFill = {
  ratio: 0,
  pct: 0,
  pages: 1,
  fits: true,
  measured: false,
}

/** The box Chromium paginates into: A4 minus the 14mm margin on every side. */
export function pdfContentBox(marginMm: number = PDF_PAGE_MM.margin): { width: number; height: number } {
  const pxPerMm = CSS_PX_PER_INCH / MM_PER_INCH
  return {
    width: (PDF_PAGE_MM.width - 2 * marginMm) * pxPerMm,
    height: (PDF_PAGE_MM.height - 2 * marginMm) * pxPerMm,
  }
}

export function pageFillFromHeight(
  contentHeightPx: number,
  pageHeightPx: number = pdfContentBox().height,
): PageFill {
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return { ...UNMEASURED_PAGE_FILL }
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return { ...UNMEASURED_PAGE_FILL }
  const ratio = contentHeightPx / pageHeightPx
  const fits = contentHeightPx <= pageHeightPx + PAGE_SLACK_PX
  const pages = fits
    ? 1
    : Math.max(2, Math.ceil((contentHeightPx - PAGE_SLACK_PX) / pageHeightPx))
  return {
    ratio,
    pct: Math.round(ratio * 100),
    pages,
    fits,
    measured: true,
  }
}

/** ok under 90% of a page, tight as it nears or just passes one page, over past 115%. */
export function pageFillBand(fill: PageFill): "ok" | "tight" | "over" {
  if (!fill.measured || fill.ratio < 0.9) return "ok"
  if (fill.fits || fill.ratio <= 1.15) return "tight"
  return "over"
}

export interface BulletCandidate {
  id: string
  textLength: number
  /** Document order. A length tie hides the later bullet. */
  index: number
}

/**
 * Longest bullets first, until `heightWith` reports one page. A bullet that
 * does not shorten the page is left alone. Already one page → nothing hidden.
 */
export function selectBulletsToHide(
  candidates: readonly BulletCandidate[],
  heightWith: (hidden: ReadonlySet<string>) => number,
  pageHeightPx: number = pdfContentBox().height,
): string[] {
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return []
  const ranked = candidates
    .filter(c => c.id.length > 0)
    .sort((a, b) => b.textLength - a.textLength || b.index - a.index)
  const hidden = new Set<string>()
  let height = heightWith(hidden)
  if (!Number.isFinite(height) || height <= 0 || height <= pageHeightPx + PAGE_SLACK_PX) return []
  for (const item of ranked) {
    if (hidden.has(item.id)) continue
    hidden.add(item.id)
    const next = heightWith(hidden)
    if (!Number.isFinite(next) || next >= height) {
      hidden.delete(item.id)
      continue
    }
    height = next
    if (height <= pageHeightPx + PAGE_SLACK_PX) break
  }
  return [...hidden]
}

/** A bullet the person can still hide. Blank bullets are on the sheet too. */
export function hasHideableBullets(cv: CVStructured, hidden: Set<string>): boolean {
  for (let ei = 0; ei < cv.experience.length; ei++) {
    const bullets = cv.experience[ei]?.bullets ?? []
    for (let bi = 0; bi < bullets.length; bi++) {
      if (!hidden.has(itemId("exp_bullet", ei * 100 + bi, bullets[bi] ?? ""))) return true
    }
  }
  for (let pi = 0; pi < cv.projects.length; pi++) {
    const bullets = cv.projects[pi]?.bullets ?? []
    for (let bi = 0; bi < bullets.length; bi++) {
      if (!hidden.has(itemId("proj_bullet", pi * 100 + bi, bullets[bi] ?? ""))) return true
    }
  }
  return false
}

function exportReady(): boolean {
  return typeof document !== "undefined" && document.body != null
}

/** Lay the sheet out the way the PDF renderer does, then throw the clone away. */
function withExportClone<T>(sheet: HTMLElement, read: (clone: HTMLElement) => T): T {
  const box = pdfContentBox()
  const clone = sheet.cloneNode(true) as HTMLElement
  clone.style.position = "static"
  clone.style.left = "0"
  clone.style.top = "0"
  clone.style.transform = "none"
  clone.style.zoom = "1"
  clone.style.boxSizing = "border-box"
  clone.style.width = `${box.width}px`
  clone.style.minHeight = "0"
  clone.style.height = "auto"
  clone.style.maxHeight = "none"
  clone.style.margin = "0"
  clone.style.padding = "0"
  clone.style.boxShadow = "none"
  clone.querySelectorAll<HTMLElement>(".pdf-foot").forEach(foot => {
    foot.style.display = "none"
  })
  const host = document.createElement("div")
  host.setAttribute("data-page-meter", "")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    "z-index:-1",
    `width:${box.width}px`,
  ].join(";")
  host.appendChild(clone)
  document.body.appendChild(host)
  try {
    return read(clone)
  } finally {
    host.remove()
  }
}

function bulletCandidates(root: HTMLElement): BulletCandidate[] {
  const nodes = root.querySelectorAll<HTMLElement>("[data-cv-item]")
  const out: BulletCandidate[] = []
  nodes.forEach((el, index) => {
    const id = el.getAttribute("data-cv-item") ?? ""
    if (!id.startsWith("exp_bullet:") && !id.startsWith("proj_bullet:")) return
    out.push({ id, textLength: (el.textContent ?? "").trim().length, index })
  })
  return out
}

/** Show or hide bullets, and drop a role or section the sheet would not render. */
function applyHidden(root: HTMLElement, hidden: ReadonlySet<string>): void {
  root.querySelectorAll<HTMLElement>("[data-cv-item]").forEach(el => {
    const id = el.getAttribute("data-cv-item") ?? ""
    el.style.display = hidden.has(id) ? "none" : ""
  })
  root.querySelectorAll<HTMLElement>("[data-cv-role]").forEach(role => {
    const bullets = role.querySelectorAll<HTMLElement>("[data-cv-item]")
    if (bullets.length === 0) return
    const anyVisible = Array.from(bullets).some(el => el.style.display !== "none")
    role.style.display = anyVisible ? "" : "none"
  })
  root.querySelectorAll<HTMLElement>("[data-cv-section]").forEach(section => {
    const roles = section.querySelectorAll<HTMLElement>("[data-cv-role]")
    if (roles.length === 0) return
    const anyVisible = Array.from(roles).some(el => el.style.display !== "none")
    section.style.display = anyVisible ? "" : "none"
  })
}

/** Height of `sheet` in the export box. Unmeasured when it cannot be laid out. */
export function measurePageFill(sheet: HTMLElement | null): PageFill {
  if (!sheet || !exportReady()) return { ...UNMEASURED_PAGE_FILL }
  const height = withExportClone(sheet, clone => clone.scrollHeight)
  return pageFillFromHeight(height)
}

/**
 * Bullet ids to hide so this sheet's export fits one page. Empty when it
 * already fits, when nothing on it is a bullet, or when it cannot be laid out.
 */
export function bulletsToHide(sheet: HTMLElement | null): string[] {
  if (!sheet || !exportReady()) return []
  return withExportClone(sheet, clone => {
    const candidates = bulletCandidates(clone)
    return selectBulletsToHide(candidates, hidden => {
      applyHidden(clone, hidden)
      return clone.scrollHeight
    })
  })
}
