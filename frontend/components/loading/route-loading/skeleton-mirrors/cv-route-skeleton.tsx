"use client"

import { CVBaselineSkeleton } from "./cv-baseline-skeleton"
import { CVExportSkeleton } from "./cv-export-skeleton"
import { CVWorkstationSkeleton } from "./cv-workstation-skeleton"

/**
 * The ONE answer to "what shape is the CV route about to be".
 *
 * `/cv` has three destinations and, until now, four opinions about them.
 * `f00bf6fd` made loading.tsx and the page agree on the WORKSTATION door and
 * left the other two open: the baseline door still handed CVBaselineSkeleton to
 * a page that painted CvSkeleton, the page's Suspense fallback painted
 * CvSkeleton unconditionally — a baseline-shaped flash between two
 * workstation-shaped skeletons on `?edit=1` — and skeletonForPath answered
 * CvSkeleton for the whole segment including /cv/export.
 *
 * Every boundary that guards this route calls this, so the three destinations
 * cannot drift apart again:
 *
 *   /cv                      the library      CVBaselineSkeleton
 *   /cv?jobId= | ?edit=1     the workstation  CVWorkstationSkeleton
 *   /cv/export               the document     CVExportSkeleton
 *
 * Reads location directly rather than useSearchParams: this renders inside
 * `loading.tsx`, above the Suspense boundary that hook requires, and the router
 * has already committed the URL before a loading boundary mounts. Same read
 * loading.tsx did inline before it moved here.
 */
export function CVRouteSkeleton() {
  if (typeof window === "undefined") return <CVBaselineSkeleton />

  const { pathname, search } = window.location
  if (pathname.startsWith("/cv/export")) return <CVExportSkeleton />

  const params = new URLSearchParams(search)
  const workstation = params.has("jobId") || params.get("edit") === "1"
  return workstation ? <CVWorkstationSkeleton /> : <CVBaselineSkeleton />
}
