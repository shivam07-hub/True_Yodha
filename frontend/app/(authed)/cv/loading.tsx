"use client"

// FOUC fix (#41 L4). The CV route's stylesheets — chiefly the 79KB compiled
// cv-builder.css — are route-scoped chunks tied to page.tsx. On a soft client
// navigation (e.g. nav → /cv) the real playground painted before that 79KB
// chunk finished downloading → the raw/unstyled flash. Importing the same CSS
// here binds it to the loading boundary too, so it downloads in parallel with
// page.tsx's JS/RSC and is ready before the page mounts. It's one deduped chunk
// (page.tsx imports the same files); this only makes it load ~1 RTT earlier.
import "./cv-fonts.css"
import "./cv-sheet.css"
import "./cv-builder.css"
import "./playground-v2.css"

import { CVBaselineSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-baseline-skeleton"
import { CVPlaygroundSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-playground-skeleton"

export default function CVLoading() {
  // Safe to read synchronously: this component only renders client-side,
  // and the URL is already updated by the router before loading.tsx mounts.
  const hasJobId =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("jobId")

  return hasJobId ? <CVPlaygroundSkeleton /> : <CVBaselineSkeleton />
}
