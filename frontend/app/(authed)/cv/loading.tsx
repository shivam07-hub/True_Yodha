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
// The baseline (no ?jobId) view mounts LibraryView, whose CSS is its own
// route-scoped chunk — not covered by the four imports above, so it hit the
// exact same flash #41 L4 fixed for the playground (raw LibraryView markup,
// e.g. the CV/Stories/Memory pills + job rows, painting before its rules
// download). Bind it here too so it's ready before LibraryView mounts.
import "@/components/cv/builder/library-view.css"
import "@/components/cv/mobile/mobile-cv-hub.css"
import "@/components/cv/mobile/mobile-cv-editor.css"
import "@/components/cv/builder/tailor-weave.css"
import "./cv-workstation.css"

import { CVBaselineSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-baseline-skeleton"
import { CVWorkstationSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-workstation-skeleton"

export default function CVLoading() {
  // Safe to read synchronously: this component only renders client-side,
  // and the URL is already updated by the router before loading.tsx mounts.
  // BOTH workstation doors are checked here — `?jobId=` (tailor a job) and
  // `?edit=1` (Main CV). Only the first was, so every trip to the Main CV
  // opened on the library skeleton and then relaid out into the workstation.
  const params = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null
  const workstation = !!params && (params.has("jobId") || params.get("edit") === "1")

  return workstation ? <CVWorkstationSkeleton /> : <CVBaselineSkeleton />
}
