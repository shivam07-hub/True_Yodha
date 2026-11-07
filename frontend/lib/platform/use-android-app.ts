"use client"

import { useSyncExternalStore } from "react"
import { isAndroidApp } from "@/lib/platform/app-shell"

function subscribe(): () => void {
  return () => {}
}

/** Client read of the shell. The server snapshot is web; the first client
 *  read is the session's real answer. */
export function useIsAndroidApp(): boolean {
  return useSyncExternalStore(subscribe, isAndroidApp, () => false)
}
