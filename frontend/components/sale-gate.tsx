"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { isAndroidApp } from "@/lib/platform/app-shell"
import { useIsAndroidApp } from "@/lib/platform/use-android-app"

/** A price or a buy control. The web shows it at once. The app never does. */
export function SaleOffer({ children }: { children: ReactNode }) {
  const inApp = useIsAndroidApp() || (typeof window !== "undefined" && isAndroidApp())
  if (inApp) return null
  return children
}

/**
 * A page that is only a pitch.
 *
 * The web renders it immediately. Inside the app a pitch goes to Jobs and
 * paints nothing. `pending` waits without painting a price. `false` means the
 * person already owns it — that stays, and the price is a SaleOffer.
 */
export function SalePage({
  children,
  pitch = true,
}: {
  children: ReactNode
  pitch?: boolean | "pending"
}) {
  const router = useRouter()
  const inApp = useIsAndroidApp() || (typeof window !== "undefined" && isAndroidApp())
  useEffect(() => {
    if (inApp && pitch === true) router.replace("/market")
  }, [inApp, pitch, router])
  if (!inApp) return children
  if (pitch === false) return children
  return null
}
