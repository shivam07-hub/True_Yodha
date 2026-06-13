"use client"

import { useEffect } from "react"
import { capturePendingAttribution } from "@/lib/attribution"

export function AttributionCapture() {
  useEffect(() => {
    capturePendingAttribution()
  }, [])

  return null
}
