"use client"

import { useEffect } from "react"

import { CVWorkstationSkeleton } from "@/components/loading/route-loading/skeleton-mirrors/cv-workstation-skeleton"
import { skeletonForPath } from "@/components/loading/page-skeletons"
import {
  phoneLabSkeletonPath,
  type PhoneLabSurface,
  type PhoneLabTabId,
} from "@/lib/dev/phone-lab"
import { AppShellSkeleton } from "@/mobile"

/**
 * The bootstrap frame: chrome + one page skeleton. Mounted inside a 375px
 * iframe so dual-skin CSS and the mobile bars resolve as they do on a phone.
 */
export function PhoneFrameBody({
  tab,
  surface,
}: {
  tab: PhoneLabTabId
  surface: PhoneLabSurface
}) {
  useEffect(() => {
    const root = document.documentElement
    const prior = root.getAttribute("data-surface")
    const priorScheme = root.style.colorScheme
    root.setAttribute("data-surface", surface)
    root.style.colorScheme = surface
    return () => {
      if (prior) root.setAttribute("data-surface", prior)
      else root.removeAttribute("data-surface")
      root.style.colorScheme = priorScheme
    }
  }, [surface])

  const page =
    tab === "cv-work" ? (
      <CVWorkstationSkeleton />
    ) : (
      skeletonForPath(phoneLabSkeletonPath(tab))
    )

  return <AppShellSkeleton>{page}</AppShellSkeleton>
}
